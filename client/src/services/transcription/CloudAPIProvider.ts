// 云 API 模式 Provider
// 豆包 ASR：边录边发（实时流式）
// 其他 ASR：录完再发（BufferedProvider）

import { isQwenOmniProvider, resolveQwenOmniModel } from '@/lib/asrModels'
import { uint8ArrayToBase64 } from '@/lib/encoding'
import { stripMarkdown } from '@/lib/stripMarkdown'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getSetting, getSettingsBatch } from '../store'
import { addRuntimeEvent } from '../debugLog'
import type {
  TranscriptionProvider,
  TranscriptionCallbacks,
  StartOptions,
  StopOptions,
  WorkMode,
} from './types'

interface AiProviderConfig {
  provider: string
  api_url: string
  api_key: string
  model: string
  extra?: Record<string, unknown>
}

interface AsrProviderConfig {
  provider: string
  api_key: string
  app_id: string
  extra?: Record<string, unknown>
}

interface AsrResult { text: string; elapsed_ms: number }
interface AiResult { text: string; elapsed_ms: number }

/**
 * 非流式云端 ASR 的音频分片参数。
 *
 * 背景：长录音若整段一次性 base64 提交给 cloud_transcribe，
 * PCM 体积会很大（如 3 分钟 ≈ 7.7MB base64），而 Rust 侧千问/豆包
 * 请求的 HTTP 超时写死为 60s，长音频极易超时或触发上游服务端限制，
 * 导致"在线接口长录音识别失败"。
 *
 * 解决：把 PCM 按该时长分片，逐片调用 cloud_transcribe，再拼接文本。
 * 每片时长取刷新 60s 超时以下的稳妥值（提交时长 * 处理系数）。
 */
const BUFFERED_SEGMENT_SEC = 30
const SAMPLE_RATE = 16000
const BUFFERED_SEGMENT_BYTES = BUFFERED_SEGMENT_SEC * SAMPLE_RATE * 2 // 30s * 16000 * 2

export class CloudAPIProvider implements TranscriptionProvider {
  readonly mode: WorkMode = 'cloud_api'

  private callbacks: TranscriptionCallbacks = {}
  private sessionActive = false
  private startOpts: StartOptions | undefined
  private ready = false

  // 豆包/千问流式状态
  private isDoubaoStream = false
  private isQwenStream = false
  private doubaoStreamReady = false
  private qwenStreamReady = false
  private streamStartTime = 0
  private pendingChunks: ArrayBuffer[] = []
  private flushTimer: ReturnType<typeof setInterval> | null = null

  // 非流式路径的完整音频缓存。
  // 不能依赖 Orchestrator 传入的 audioChunks（ctx.recordedChunks）——
  // AudioPipeline 每 5s 增量写盘时会清空 recordedChunks，长录音 stop 后只剩最后几秒 → 丢字。
  private bufferedChunks: ArrayBuffer[] = []

  // 会议纪要流式 partial 推送订阅（Rust 端 emit "asr-partial"）
  private partialUnlisten: (() => void) | null = null
  private partialSessionId: string | null = null

  async connect(callbacks: TranscriptionCallbacks): Promise<void> {
    this.callbacks = callbacks
    this.ready = true
    callbacks.onStateChange?.('connected')
    callbacks.onReady?.({ asr: true, llm: true })

    // 订阅 partial 事件（幂等：先取消旧订阅）
    this.unsubscribePartial()
    try {
      this.partialUnlisten = await listen<{ sessionId: string; text: string; isFinal: boolean }>(
        'asr-partial',
        (e) => {
          // sessionId 匹配：会议纪要场景下，Orchestrator/MeetingService 会设置同一个 sessionId
          if (this.partialSessionId && e.payload.sessionId !== this.partialSessionId) return
          this.callbacks.onPartial?.(e.payload.text, e.payload.isFinal)
        },
      )
    } catch (err) {
      addRuntimeEvent('warn', 'cloud_api', '订阅 asr-partial 失败', { error: String(err) })
    }
  }

  /** 设置 partial 路由的 sessionId（会议纪要场景下使用） */
  setPartialSessionId(id: string | null) {
    this.partialSessionId = id
  }

  private unsubscribePartial() {
    if (this.partialUnlisten) {
      try { this.partialUnlisten() } catch { /* ignore */ }
      this.partialUnlisten = null
    }
  }

  start(opts?: StartOptions): boolean {
    if (!this.ready) {
      addRuntimeEvent('error', 'cloud_api', 'start 失败：Provider 未就绪')
      return false
    }
    this.sessionActive = true
    this.startOpts = opts
    this.isDoubaoStream = false
    this.isQwenStream = false
    this.doubaoStreamReady = false
    this.qwenStreamReady = false
    this.streamStartTime = performance.now()
    this.pendingChunks = []
    this.bufferedChunks = []

    // 异步判断供应商并建连
    void this.tryStartRealtimeStream()

    return true
  }

  sendAudio(buffer: ArrayBuffer): void {
    if (!this.sessionActive) return

    // 豆包/千问流式：攒到 pendingChunks，由定时器批量发送
    // 其他供应商（buffered）：攒到 bufferedChunks，stop 后整段发送
    if (this.isDoubaoStream || this.isQwenStream) {
      this.pendingChunks.push(buffer.slice(0))
    } else {
      this.bufferedChunks.push(buffer.slice(0))
    }
  }

  stop(_opts?: StopOptions): boolean {
    if (!this.sessionActive) return false
    this.sessionActive = false
    void this.runProcess()
    return true
  }

  /**
   * 同步触发并等待处理完成。返回最终 llmText（如果有）。
   * 会议纪要场景使用，确保 onFinal 回调触发后再让 UI 进入 done 状态。
   */
  async stopAndWait(): Promise<string | null> {
    if (!this.sessionActive) return null
    this.sessionActive = false
    return await this.runProcessSync()
  }

  /** 中止在途处理（"处理中重新开始录音"场景）：
   *  关闭流式连接、清空缓冲，使旧 run 不再产生新的音频/partial。
   *  非流式路径中已发出的 cloud_transcribe 无法真正取消，
   *  但旧 run 的回调会在 Orchestrator 侧按 run 代次被丢弃。 */
  abort(): void {
    this.sessionActive = false
    this.pendingChunks = []
    this.bufferedChunks = []
    if (this.flushTimer) { clearInterval(this.flushTimer); this.flushTimer = null }
    if (this.isDoubaoStream) invoke('doubao_stream_close').catch(() => {})
    if (this.isQwenStream) invoke('qwen_stream_close').catch(() => {})
    this.isDoubaoStream = false
    this.isQwenStream = false
    this.doubaoStreamReady = false
    this.qwenStreamReady = false
  }

  disconnect(): void {
    this.sessionActive = false
    this.pendingChunks = []
    this.bufferedChunks = []
    this.ready = false
    this.isDoubaoStream = false
    this.isQwenStream = false
    this.doubaoStreamReady = false
    this.qwenStreamReady = false
    if (this.flushTimer) { clearInterval(this.flushTimer); this.flushTimer = null }
    invoke('doubao_stream_close').catch(() => {})
    invoke('qwen_stream_close').catch(() => {})
    this.callbacks.onStateChange?.('disconnected')
    this.unsubscribePartial()
    this.partialSessionId = null
  }

  isReady(): boolean {
    return this.ready
  }


  // ── 豆包流式建连 ──

  private async tryStartRealtimeStream(): Promise<void> {
    try {
      const settings = await getSettingsBatch({
        'cloudAsr.provider': 'doubao',
        'cloudAsr.apiKey': '',
        'cloudAsr.appId': '',
      })
      const asrProvider = settings['cloudAsr.provider'] as string

      if (asrProvider === 'doubao_v2') {
        this.isDoubaoStream = true
        addRuntimeEvent('info', 'cloud_api', '豆包流式：建立连接')
        await invoke('doubao_stream_open', {
          config: {
            provider: 'doubao_v2',
            api_key: settings['cloudAsr.apiKey'] as string,
            app_id: settings['cloudAsr.appId'] as string,
          },
          sampleRate: 16000,
          hotwords: this.startOpts?.hotwords ?? [],
        })
        this.doubaoStreamReady = true
        addRuntimeEvent('info', 'cloud_api', '豆包流式：连接就绪')
      } else if (asrProvider === 'qwen' || asrProvider === 'qwen_realtime') {
        this.isQwenStream = true
        const apiKey = settings['cloudAsr.apiKey'] as string

        addRuntimeEvent('info', 'cloud_api', '千问流式：建立连接')
        await invoke('qwen_stream_open', {
          config: { provider: 'qwen', api_key: apiKey, app_id: '' },
          hotwords: this.startOpts?.hotwords ?? [],
        })
        this.qwenStreamReady = true
        addRuntimeEvent('info', 'cloud_api', '千问流式：连接就绪')
      } else {
        // 其他供应商不走流式
        return
      }

      // 补发建连期间已缓存的音频（此时 isDoubaoStream/isQwenStream 尚未置 true，
      // 音频都在 bufferedChunks 里）—— 先并入 pendingChunks 再一起发送，避免开头丢字
      this.pendingChunks.push(...this.bufferedChunks)
      this.bufferedChunks = []
      await this.flushPendingChunks()

      // 启动定时器，每 200ms 批量发送一次
      this.flushTimer = setInterval(() => {
        const ready = this.doubaoStreamReady || this.qwenStreamReady
        if (ready && this.pendingChunks.length > 0) {
          void this.flushPendingChunks()
        }
      }, 200)
    } catch (err) {
      addRuntimeEvent('warn', 'cloud_api', '流式建连失败，回退到录完再发', { error: String(err) })
      this.isDoubaoStream = false
      this.isQwenStream = false
      this.doubaoStreamReady = false
      this.qwenStreamReady = false
    }
  }

  private async flushPendingChunks(): Promise<void> {
    if (this.pendingChunks.length === 0) return

    const chunks = this.pendingChunks
    this.pendingChunks = []

    const totalLen = chunks.reduce((s, c) => s + c.byteLength, 0)
    const merged = new Uint8Array(totalLen)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(new Uint8Array(chunk), offset)
      offset += chunk.byteLength
    }

    const b64 = uint8ArrayToBase64(merged)
    try {
      if (this.isDoubaoStream) {
        await invoke('doubao_stream_send', { pcmB64: b64 })
      } else if (this.isQwenStream) {
        await invoke('qwen_stream_send', { pcmB64: b64 })
      }
    } catch (err) {
      addRuntimeEvent('warn', 'cloud_api', '流式发送失败', { error: String(err) })
    }
  }

  // ── 处理逻辑 ──

  private async runProcess(): Promise<void> {
    await this.runProcessSync()
  }

  /** 同步版：返回最终 llmText（如果有），供 stopAndWait 用 */
  private async runProcessSync(): Promise<string | null> {
    const stopTime = performance.now() // stop 时刻，用于计算流式模式的等待时间
    const startTime = this.streamStartTime || stopTime
    // 本轮 run 的回调快照：abort 后新录音会 connect 新的回调，
    // 旧 run 必须只回调自己这一轮的回调对象（由 Orchestrator 按代次判废）。
    const cb = { ...this.callbacks }

    try {
      // 音频总量判定：
      // - 流式模式：音频通过 pendingChunks 增量发送，Rust 端已累积 → 只需确认还有内容要发（或已发过）
      // - buffered 模式：用 Provider 自缓存的完整音频（bufferedChunks）。
      //   不要用 ctx.recordedChunks（audioChunks）—— 它会被 AudioPipeline 增量写盘清空，
      //   长录音 stop 后只剩最后几秒，导致 ASR 丢字。
      const isStreamReady = (this.isDoubaoStream && this.doubaoStreamReady)
        || (this.isQwenStream && this.qwenStreamReady)
      const totalBytes = this.bufferedChunks.reduce((sum, buf) => sum + buf.byteLength, 0)
      if (totalBytes === 0 && !isStreamReady) {
        cb.onDone?.()
        return null
      }

      const durationSec = (totalBytes / 2) / 16000
      if (!isStreamReady && durationSec < 0.3) {
        addRuntimeEvent('info', 'cloud_api', '音频过短，跳过处理', { durationSec })
        if (this.isDoubaoStream) invoke('doubao_stream_close').catch(() => {})
        if (this.isQwenStream) invoke('qwen_stream_close').catch(() => {})
        cb.onDone?.()
        return null
      }

      // 读取 ASR 配置（批量获取，避免串行 RPC）
      const settings = await getSettingsBatch({
        'cloudAsr.provider': 'doubao',
        'cloudAsr.apiKey': '',
        'cloudAsr.appId': '',
        'cloudAsr.omniSystemPrompt': '',
        'cloudAi.provider': 'openai_compat',
        'cloudAi.apiUrl': '',
        'cloudAi.apiKey': '',
        'cloudAi.model': '',
      })
      const asrProvider = settings['cloudAsr.provider'] as string
      const isQwenOmni = isQwenOmniProvider(asrProvider)
      addRuntimeEvent('info', 'cloud_api', `runProcess 实际 ASR 供应商 = ${asrProvider}`, {
        asrProvider,
        isQwenOmni,
        isDoubaoStream: this.isDoubaoStream,
        isQwenStream: this.isQwenStream,
        totalBytes,
        durationSec,
      })

      let asrText = ''
      let asrMs = 0

      if (isStreamReady) {
        // 流式：停止定时器，flush 剩余数据（含 bufferedChunks 残留），发送最后一包
        if (this.flushTimer) { clearInterval(this.flushTimer); this.flushTimer = null }
        this.pendingChunks.push(...this.bufferedChunks)
        this.bufferedChunks = []
        await this.flushPendingChunks()

        if (this.isDoubaoStream) {
          addRuntimeEvent('info', 'cloud_api', '豆包流式：发送 finish')
          const finishStart = performance.now()
          // 传入 sessionId 让 partial 事件能路由到正确会话
          const text = await invoke<string>('doubao_stream_finish', {
            sessionId: this.partialSessionId,
          })
          // 上游识别结果里可能含 \n（标点/转义），替成空格避免注入目标应用时换行
          asrText = text.replace(/[\r\n]+/g, ' ')
          asrMs = Math.round(performance.now() - finishStart)
          addRuntimeEvent('info', 'cloud_api', '豆包流式：识别完成', { asrMs, textLen: asrText.length })
        } else {
          addRuntimeEvent('info', 'cloud_api', '千问流式：发送 finish')
          const finishStart = performance.now()
          const text = await invoke<string>('qwen_stream_finish', {
            sessionId: this.partialSessionId,
          })
          asrText = text.replace(/[\r\n]+/g, ' ')
          asrMs = Math.round(performance.now() - finishStart)
          addRuntimeEvent('info', 'cloud_api', '千问流式：识别完成', { asrMs, textLen: asrText.length })
        }
      } else {
        // 非豆包 / 豆包建连失败：录完再发（按 BUFFERED_SEGMENT_SEC 分片，避免长音频超时）
        const asrApiKey = settings['cloudAsr.apiKey'] as string
        const asrAppId = settings['cloudAsr.appId'] as string
        const qwenOmniModel = resolveQwenOmniModel(asrProvider)

        let omniInstructions: string | undefined
        if (isQwenOmni) {
          const savedPrompt = settings['cloudAsr.omniSystemPrompt'] as string
          omniInstructions = savedPrompt || undefined
        }

        const asrConfig: AsrProviderConfig = {
          provider: isQwenOmni ? 'qwen_omni' : asrProvider,
          api_key: asrApiKey,
          app_id: asrAppId,
          ...(isQwenOmni && {
            extra: { model: qwenOmniModel, instructions: omniInstructions },
          }),
        }

        // 分段转写：先把完整 PCM 合并为一块，再按步进切成 ≤BUFFERED_SEGMENT_BYTES 的
        // 子段，并发调用 cloud_transcribe 后按序拼接。
        // - 智谱单次限制 ≤30s，必须分片；
        // - 并发（限制 3 路）避免长录音多片串行导致总耗时线性累加。
        const merged = new Uint8Array(totalBytes)
        let mergeOffset = 0
        for (const buf of this.bufferedChunks) {
          merged.set(new Uint8Array(buf), mergeOffset)
          mergeOffset += buf.byteLength
        }

        const segmentCount = Math.ceil(totalBytes / BUFFERED_SEGMENT_BYTES)
        const CONCURRENCY = 3
        const textParts: string[] = new Array(segmentCount).fill('')
        let totalAsrMs = 0

        const segOf = (segIdx: number) => {
          const segStart = segIdx * BUFFERED_SEGMENT_BYTES
          const segLen = Math.min(BUFFERED_SEGMENT_BYTES, totalBytes - segStart)
          return { segStart, segLen }
        }

        const transcribeSeg = async (segIdx: number) => {
          const { segStart, segLen } = segOf(segIdx)
          if (segLen <= 0) return
          const audioB64 = uint8ArrayToBase64(merged.subarray(segStart, segStart + segLen))
          const segDur = segLen / 2 / SAMPLE_RATE
          addRuntimeEvent('info', 'cloud_api', 'ASR 分片转写', {
            provider: asrProvider,
            segIdx,
            segDurSec: Number(segDur.toFixed(2)),
            totalSegments: segmentCount,
          })
          const asrResult = await invoke<AsrResult>('cloud_transcribe', {
            request: {
              audio_b64: audioB64,
              sample_rate: SAMPLE_RATE,
              asr_config: asrConfig,
              hotwords: this.startOpts?.hotwords ?? [],
            },
          })
          const segText = asrResult.text.replace(/[\r\n]+/g, ' ').trim()
          textParts[segIdx] = segText
          totalAsrMs += asrResult.elapsed_ms
        }

        // 并发工作队列：限制同时最多 CONCURRENCY 路
        let next = 0
        const workers = Array.from({ length: Math.min(CONCURRENCY, segmentCount) }, async () => {
          while (next < segmentCount) {
            const idx = next++
            await transcribeSeg(idx).catch((err) => {
              addRuntimeEvent('warn', 'cloud_api', 'ASR 分片失败', { segIdx: idx, error: String(err) })
            })
          }
        })
        await Promise.all(workers)

        asrText = textParts.filter(Boolean).join(' ')
        asrMs = totalAsrMs
      }

      // 发送 ASR 中间结果
      cb.onASR?.({ text: asrText, asrMs, durationSec })

      if (!asrText.trim()) {
        cb.onFinal?.({ asrText: '', llmText: '', asrMs, llmMs: 0, durationSec })
        cb.onDone?.()
        return null
      }

      // AI 校对（Qwen Omni 已内置 AI，跳过）
      let llmText = asrText
      let llmMs = 0

      const disableAi = this.startOpts?.disableAi ?? false
      if (!disableAi && !isQwenOmni) {
        const aiProvider = settings['cloudAi.provider'] as string
        const aiApiUrl = settings['cloudAi.apiUrl'] as string
        const aiApiKey = settings['cloudAi.apiKey'] as string
        const aiModel = settings['cloudAi.model'] as string

        if (aiApiUrl && aiApiKey && aiModel) {
          const aiConfig: AiProviderConfig = {
            provider: aiProvider, api_url: aiApiUrl, api_key: aiApiKey, model: aiModel,
          }
          addRuntimeEvent('info', 'cloud_api', '开始 AI 校对', { provider: aiProvider, model: aiModel })

          try {
            const targetAppContext = this.startOpts?.appContext
            const targetApp = targetAppContext?.processName
              ? {
                  process_name: targetAppContext.processName,
                  window_title: targetAppContext.windowTitle || '',
                }
              : undefined

            const aiResult = await invoke<AiResult>('cloud_polish', {
              request: {
                text: asrText,
                ai_config: aiConfig,
                system_prompt: this.startOpts?.systemPrompt || null,
                target_app: targetApp,
              },
            })
            // 润色输出经常带 markdown；不支持 markdown 的目标（终端/纯文本框）会乱码 —
            // 剥成纯文本后再回传。
            // **保留原生换行**：AI 润色结果可能含段落 / 列表项分隔，注入目标应用时按 AI 自身意图呈现。
            // 折叠换行的逻辑仅在"语音转文字"路径（processFinalResult）统一收口，
            // 这里的 llmText 同时被 PTT 润色与 AI 对话路径消费，不宜在此处折叠。
            llmText = stripMarkdown(aiResult.text || '') || asrText
            llmMs = aiResult.elapsed_ms
          } catch (err) {
            addRuntimeEvent('warn', 'cloud_api', 'AI 校对失败，使用 ASR 原文', { error: String(err) })
          }
        }
      }

      const totalMs = Math.round(performance.now() - startTime)
      addRuntimeEvent('info', 'cloud_api', '处理完成', { durationSec, asrMs, llmMs, totalMs })

      const omniModel = isQwenOmni ? resolveQwenOmniModel(asrProvider) : undefined

      cb.onFinal?.({
        asrText, llmText, asrMs, llmMs, durationSec,
        ...(isQwenOmni && { asrEngine: 'qwen_omni', asrModel: omniModel }),
      })
      cb.onDone?.()
      return llmText
    } catch (err) {
      addRuntimeEvent('error', 'cloud_api', '处理异常', { error: String(err) })
      cb.onError?.(String(err))
      cb.onDone?.()
      return null
    }
  }
}
