// 会议纪要 — 状态机服务
// 独立于 RecorderOrchestrator，不走 PTT 4+1 计时器，不保存音频
// 设计：
//   1. UI 订阅 MeetingService 状态
//   2. MeetingService 通过统一 TranscriptionProvider 调用 ASR
//      - cloud_api 模式：流式 partial 实时刷新
//      - local / server 模式：stop 后一次性返回 onFinal（无 partial，但能完整转写）
//   3. 录音 → ASR → finalizedSegments → 拼装 fullText
//   4. 用户可选调 bridge.summarizeMeeting 生成 AI 总结

import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { addRuntimeEvent } from '../debugLog'
import { getSetting } from '../store'
import { getProvider } from '../transcription'
import type { TranscriptionCallbacks } from '../transcription/types'
import type { MeetingSegment } from '../store'
import type { MeetingRuntime, MeetingState } from './types'

type MeetingListener = (runtime: MeetingRuntime) => void

class MeetingServiceImpl {
  private provider: ReturnType<typeof getProvider> | null = null
  private runtime: MeetingRuntime = this.createInitialRuntime()
  private listeners = new Set<MeetingListener>()
  private elapsedTimer: ReturnType<typeof setInterval> | null = null
  private unlistenPartial: UnlistenFn | null = null
  /** partial 路由用的 sessionId（与 Rust 端 doubao/qwen_stream_finish 的 sessionId 对应） */
  private currentSessionId = ''

  // ── 订阅 ──

  getRuntime(): MeetingRuntime {
    return this.runtime
  }

  subscribe(listener: MeetingListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify() {
    this.listeners.forEach((l) => {
      try { l(this.runtime) } catch { /* ignore */ }
    })
  }

  private updateRuntime(patch: Partial<MeetingRuntime>) {
    this.runtime = { ...this.runtime, ...patch }
    this.notify()
  }

  private createInitialRuntime(): MeetingRuntime {
    return {
      state: 'idle',
      sessionId: '',
      startTimestamp: 0,
      elapsedSec: 0,
      pendingText: '',
      finalizedSegments: [],
      fullText: '',
      errorMessage: '',
    }
  }

  // ── 控制 ──

  /** 开始会议：建连、开始流式 ASR、开始录音（无 4+1 计时器） */
  async start(): Promise<void> {
    if (this.runtime.state === 'recording') return

    // 检查 provider 是否就绪 — 会议纪要支持 cloud_api / local / server 全部三种 ASR
    // cloud_api 能拿到流式 partial；local / server 只有 stop 后的 onFinal（一段完整文本）
    const workMode = await getSetting('workMode', 'server')
    if (workMode !== 'cloud_api' && workMode !== 'local' && workMode !== 'server') {
      this.updateRuntime({
        state: 'error',
        errorMessage: `未知工作模式 "${workMode}"，请在"语音引擎"中切换为「云 API」/「本地」/「服务器」之一`,
      })
      return
    }

    this.currentSessionId = `meeting-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    // 1. 不再订阅 'asr-partial' Tauri 事件：partial 路由统一走 provider.onPartial 回调 —
    //    cloud_api 内部已 listen 'asr-partial' 并推到 callbacks.onPartial；
    //    local 通过 VAD 切分推 onPartial；server 无 partial 等 onFinal 兜底。

    // 2. 创建并连接 provider（统一接口，mode 由 workMode 决定）
    this.provider = getProvider()
    // 如当前 provider 支持 partial sessionId 路由（云 API），告诉它 sessionId
    const p = this.provider as unknown as { setPartialSessionId?: (id: string | null) => void }
    if (typeof p.setPartialSessionId === 'function') {
      p.setPartialSessionId(this.currentSessionId)
    }
    const callbacks: TranscriptionCallbacks = {
      onReady: () => {
        addRuntimeEvent('info', 'meeting', 'ASR provider 就绪', { mode: this.provider?.mode })
      },
      onError: (msg) => {
        this.updateRuntime({ state: 'error', errorMessage: msg })
      },
      // onPartial: cloud_api 走 Tauri 'asr-partial' 事件（已在 line 87 订阅），
      // local 模式走 provider 内部 VAD 句子级切分（start() 时已接到此回调），
      // server 模式不会触发（无 VAD 增量能力）。统一路由进 handlePartial。
      onPartial: (text, isFinal) => {
        this.handlePartial(text, isFinal)
      },
      // onFinal 在所有 mode 下都会触发（local / server 模式下 stop 后一次性返回）；
      // cloud_api 下作 partial routing 偶尔提供最终态的兜底
      onFinal: (result) => {
        const text = (result.llmText || result.asrText || '').trim()
        if (!text) return
        addRuntimeEvent('info', 'meeting', 'ASR 最终结果（兜底）', {
          len: text.length,
          mode: this.provider?.mode,
        })
        const lastSeg = this.runtime.finalizedSegments[this.runtime.finalizedSegments.length - 1]
        const startSec = lastSeg ? lastSeg.endSec : 0
        const newSeg: MeetingSegment = {
          startSec,
          endSec: this.runtime.elapsedSec,
          text,
          isPartial: false,
        }
        // 避免与已推送的 partial 重复：若最后一段文字相同则跳过
        if (lastSeg && lastSeg.text === text) return
        const newSegments = [...this.runtime.finalizedSegments, newSeg]
        this.updateRuntime({
          finalizedSegments: newSegments,
          pendingText: '',
          fullText: newSegments.map((s) => s.text).join('\n'),
        })
      },
    }
    await this.provider.connect(callbacks)

    const started = this.provider.start({
      disableAi: true,  // 会议不需要 polish
      source: 'live',
    })
    if (!started) {
      this.updateRuntime({ state: 'error', errorMessage: 'ASR 启动失败' })
      return
    }

    // 4. 启动真实录音（audio → provider.sendAudio）
    const selectedMic = await getSetting('selectedMic', '') as string
    const { startCapture, stopCapture } = await import('../audio')

    await startCapture(
      selectedMic || undefined,
      (buffer) => {
        this.provider?.sendAudio(buffer)
      },
      undefined,
      undefined,
    )
    // 把 stopCapture 保存供 stop() 时调用
    ;(this as unknown as { stopCaptureFn: () => Promise<void> }).stopCaptureFn = stopCapture

    // 5. 重置 runtime
    this.runtime = {
      ...this.createInitialRuntime(),
      state: 'recording',
      sessionId: this.currentSessionId,
      startTimestamp: Date.now(),
    }
    this.notify()

    // 6. 启动计时器
    this.elapsedTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.runtime.startTimestamp) / 1000)
      this.updateRuntime({ elapsedSec: elapsed })
    }, 1000)
  }

  /** 结束会议：停录音、等 final、保存到 history（不保存音频） */
  async stop(): Promise<void> {
    if (this.runtime.state !== 'recording') return
    this.updateRuntime({ state: 'finalizing' })
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer)
      this.elapsedTimer = null
    }

    if (!this.provider) {
      this.updateRuntime({ state: 'error', errorMessage: 'ASR provider 未初始化' })
      return
    }

    // 1. 先停录音（避免最后一帧 PCM 丢失）
    try {
      const stopFn = (this as unknown as { stopCaptureFn?: () => Promise<void> }).stopCaptureFn
      if (stopFn) await stopFn()
    } catch { /* ignore */ }

    // 2. 停 ASR（等 final —— 同步等待处理完成，回调里的 onFinal 已经把文字塞进 segments）
    // CloudAPIProvider 有 stopAndWait（流式 final）；LocalProvider / ServerProvider 的 stop() 是 fire-and-forget，
    // 处理结果通过 onFinal / onDone 回调到达。这里给所有 mode 一个统一等待：
    //  - cloud_api：stopAndWait 阻塞直到 Rust 推完 final
    //  - 其他 mode：等到 onFinal 已通过 setState 推过（race-safe），最差超时 1 秒兜底
    if (this.provider.mode === 'cloud_api' && typeof (this.provider as unknown as { stopAndWait?: () => Promise<string | null> }).stopAndWait === 'function') {
      await (this.provider as unknown as { stopAndWait: () => Promise<string | null> }).stopAndWait()
    } else {
      this.provider.stop()
      // 等待 finalizedSegments 在录音停止后被填充（onFinal 写入）
      const initialLen = this.runtime.finalizedSegments.length
      const deadline = Date.now() + 60_000  // local ASR 可能要 30s+
      while (Date.now() < deadline) {
        // 若 onFinal 已写入新段、或 onDone / onError 触发，都跳出
        if (this.runtime.finalizedSegments.length > initialLen) break
        await new Promise((r) => setTimeout(r, 200))
      }
    }

    // 合并：把最后一段 pendingText（如果还有）也加入 finalizedSegments
    let finalSegments = this.runtime.finalizedSegments
    if (this.runtime.pendingText.trim()) {
      const lastSeg = finalSegments[finalSegments.length - 1]
      const startSec = lastSeg ? lastSeg.endSec : 0
      finalSegments = [
        ...finalSegments,
        { startSec, endSec: this.runtime.elapsedSec, text: this.runtime.pendingText, isPartial: false },
      ]
    }

    this.updateRuntime({
      state: 'done',
      finalizedSegments: finalSegments,
      pendingText: '',
      fullText: finalSegments.map((s) => s.text).join('\n'),
    })

    // 清理
    try { this.provider?.disconnect() } catch { /* ignore */ }
    this.provider = null
    this.unlistenPartial?.()
    this.unlistenPartial = null
  }

  /** 取消会议：清理资源，不保存 */
  cancel(): void {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer)
      this.elapsedTimer = null
    }
    try { this.provider?.disconnect() } catch { /* ignore */ }
    this.provider = null
    this.unlistenPartial?.()
    this.unlistenPartial = null
    this.currentSessionId = ''
    this.runtime = this.createInitialRuntime()
    this.notify()
  }

  // ── 内部：处理 partial ──

  private handlePartial(text: string, isFinal: boolean): void {
    if (isFinal) {
      // 已终结：append 到 finalizedSegments
      const lastSeg = this.runtime.finalizedSegments[this.runtime.finalizedSegments.length - 1]
      const startSec = lastSeg ? lastSeg.endSec : 0
      const newSeg: MeetingSegment = {
        startSec,
        endSec: this.runtime.elapsedSec,
        text,
        isPartial: false,
      }
      const newSegments = [...this.runtime.finalizedSegments, newSeg]
      this.updateRuntime({
        finalizedSegments: newSegments,
        pendingText: '',
        fullText: newSegments.map((s) => s.text).join('\n'),
      })
    } else {
      // 进行中：刷新 pendingText
      this.updateRuntime({ pendingText: text })
    }
  }
}

// 单例
export const MeetingService = new MeetingServiceImpl()
