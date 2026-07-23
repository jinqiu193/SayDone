// 会议纪要 — 状态机服务
// 独立于 RecorderOrchestrator，不走 PTT 4+1 计时器，不保存音频
// 设计：
//   1. UI 订阅 MeetingService 状态
//   2. MeetingService 内部持有 CloudAPIProvider（强制 cloud_api 流式）
//   3. 录音 → 流式 ASR → partial 实时刷 → 松手后 final → 拼装 fullText
//   4. 用户可选调 bridge.summarizeMeeting 生成 AI 总结

import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { addRuntimeEvent } from '../debugLog'
import { getSetting } from '../store'
import { CloudAPIProvider } from '../transcription/CloudAPIProvider'
import type { TranscriptionCallbacks } from '../transcription/types'
import type { MeetingSegment } from '../store'
import type { MeetingRuntime, MeetingState } from './types'

type MeetingListener = (runtime: MeetingRuntime) => void

class MeetingServiceImpl {
  private provider: CloudAPIProvider | null = null
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

    // 检查 provider 是否就绪
    const workMode = await getSetting('workMode', 'server')
    if (workMode !== 'cloud_api') {
      this.updateRuntime({
        state: 'error',
        errorMessage: '会议纪要需要云 API 模式，请在"语音引擎"中切换为「云 API」',
      })
      return
    }

    // 1. 订阅 asr-partial 事件（直接用 listen，不依赖 provider）
    this.unlistenPartial = await listen<{ sessionId: string; text: string; isFinal: boolean }>(
      'asr-partial',
      (e) => {
        // 路由：只接收当前 session 的 partial
        if (e.payload.sessionId !== this.currentSessionId) return
        this.handlePartial(e.payload.text, e.payload.isFinal)
      },
    )

    // 2. 创建并连接 provider
    this.provider = new CloudAPIProvider()
    const callbacks: TranscriptionCallbacks = {
      onReady: () => {
        addRuntimeEvent('info', 'meeting', 'ASR provider 就绪')
      },
      onError: (msg) => {
        this.updateRuntime({ state: 'error', errorMessage: msg })
      },
      // 兜底非流式 ASR（智谱清言等 HTTP 一次性识别）：在 stop 时通过 onFinal/onASR 拿到完整文字
      onFinal: (result) => {
        const text = (result.llmText || result.asrText || '').trim()
        if (!text) return
        addRuntimeEvent('info', 'meeting', 'ASR 最终结果（兜底）', { len: text.length })
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

    // 3. 启动会话
    this.currentSessionId = `meeting-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    this.provider.setPartialSessionId(this.currentSessionId)

    const started = this.provider.start({
      disableAi: true,  // 会议不需要 polish
      source: 'live',
    })
    if (!started) {
      this.updateRuntime({ state: 'error', errorMessage: 'ASR 启动失败' })
      return
    }

    // 4. 启动真实录音（audio → provider.sendAudio，不缓存）
    const selectedMic = await getSetting('selectedMic', '') as string
    const { startCapture, stopCapture } = await import('../audio')
    await startCapture(
      selectedMic || undefined,
      (buffer) => {
        // 实时送流式 ASR — audio.ts 不缓存任何东西
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

    // 2. 停 ASR（等 final —— 同步等待 runProcess 完成，回调里的 onFinal 已经把文字塞进 segments）
    await this.provider.stopAndWait()

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

  private handlePartial(text: string, isFinal: boolean) {
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
