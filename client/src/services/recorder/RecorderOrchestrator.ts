// RecorderOrchestrator — 顶层状态机 + lifecycle + callbacks 编排
//
// 重构说明（2026-07-14）：
// - 把原本 2124 行的"上帝类"拆成 5 个子模块 + RecorderContext 共享对象
// - 本文件现在只保留：状态机 / Tauri 事件订阅 / PTT 处理 / 录音 lifecycle / 子模块编排
// - 子模块清单（按职责独立）：
//   - SettingsCache     — 运行时配置缓存 + 鼠标 PTT / 滚动 IPC
//   - AudioPipeline     — 录音数据流（采集回调 / 波形 / 静音 / 增量写盘 / finalize）
//   - PreviewEngine     — 流式 ASR 预览（切段识别 + partial 推 overlay）
//   - TextInserter      — probe 校验 + paste + 兜底卡片
//   - ResultDispatcher  — ASR / AI Chat 结果处理 + 历史 + 个性化
//
// 向后兼容：
// - services/recorder.ts facade 零改动
// - 所有 public 方法签名保持一致（init / cleanup / refreshRuntimeSettings / refreshOverlaySettings / reconnectProvider / updateMouseSettings / setStateListener / getState / setPttSuppressed）
// - 内部私有方法全部重命名或下沉到子模块，不影响任何调用方

import * as bridge from '../bridge'
import { startCapture, stopCapture } from '../audio'
import { getProvider, type TranscriptionProvider, type TranscriptionCallbacks, type FinalResult } from '../transcription'
import {
  addHistory,
  getActiveChatPresetId,
  getActivePresetId,
  getPromptPresets,
  getSetting,
  type PromptPreset,
} from '../store'
import { addRuntimeEvent } from '../debugLog'
import { devLog } from '../debugConsole'
import {
  captureActiveInsertionTarget,
  startInsertionTargetTracking,
  stopInsertionTargetTracking,
  clearCapturedInsertionTarget,
} from '../textInsertion'
import { resolvePromptRouting } from '../personalization/promptRouter'
import type { ActiveAppContext } from '../../types/appContext'
import type { ClientRuntimeInfo } from '../../types/appApi'
import type { AppPromptRule, PromptResolution, UserStats } from '../personalization/types'
import type { PTTEventPayload, RecorderState, RecorderContext, TimedOutProcessingContext } from './types'
import {
  INITIAL_CONTEXT,
  PTT_TOGGLE_COOLDOWN_MS,
  MODIFIER_PTT_RELEASE_GUARD_MS,
  LATE_FINAL_GRACE_MS,
  START_CAPTURE_WAIT_MS,
  SELECTION_MAX_LENGTH,
  SHORT_AUDIO_DISCARD_SEC,
  SHORT_AUDIO_SILENCE_RATIO,
  HANDS_FREE_WARN_DELAY_MS,
  HANDS_FREE_AUTO_STOP_MS,
} from './types'
import { OverlayService } from './OverlayService'
import { PasteService } from './PasteService'
import { resolvePolishStyle, isModifierPTTSetting as _isModifierPTTSetting, computeProcessingTimeoutMs as _computeProcessingTimeoutMs, isValidTransition, VALID_TRANSITIONS } from './helpers'
import { SettingsCache } from './SettingsCache'
import { AudioPipeline } from './AudioPipeline'
import { PreviewEngine } from './PreviewEngine'
import { TextInserter } from './TextInserter'
import { ResultDispatcher } from './ResultDispatcher'

// State machine transition table 已抽到 helpers.ts（便于单测）
void VALID_TRANSITIONS

interface ResetToIdleOptions {
  keepOverlay?: boolean
  preserveLateFinalContext?: boolean
}

export class RecorderOrchestrator {
  // ─── 状态机 + 共享 context ───
  private ctx: RecorderContext = { ...INITIAL_CONTEXT }
  private onStateChange: ((s: RecorderState) => void) | null = null
  private initialized = false

  /** Tauri 事件监听 unlisten 句柄 — 必须 cleanup()，否则 HMR 泄漏 */
  private readonly unlistenFns: Array<() => void> = []

  // ─── 服务依赖 ───
  private readonly overlayService: OverlayService
  private readonly pasteService = new PasteService()
  private get provider(): TranscriptionProvider { return getProvider() }

  // ─── 子模块 ───
  private readonly settingsCache: SettingsCache
  private readonly audioPipeline: AudioPipeline
  private readonly previewEngine: PreviewEngine
  private readonly textInserter: TextInserter
  private readonly resultDispatcher: ResultDispatcher

  constructor() {
    // overlayService 需要 getLiveElapsedSec — 先占位，构造完成后立即注入
    this.overlayService = new OverlayService(() => this.getLiveElapsedSec())

    this.settingsCache = new SettingsCache(this.overlayService)

    this.audioPipeline = new AudioPipeline(this.ctx, this.overlayService)

    this.previewEngine = new PreviewEngine(
      this.ctx,
      this.overlayService,
      {
        isPreviewEnabled: () => this.settingsCache.isPreviewEnabled(),
        getProviderMode: () => this.provider.mode,
      },
    )

    this.textInserter = new TextInserter(
      this.ctx,
      this.pasteService,
      this.overlayService,
      {
        waitForModifierPTTReleaseIfNeeded: () => this.waitForModifierPTTReleaseIfNeeded(),
        resetToIdleFn: (opts) => this.resetToIdle(opts),
      },
    )

    this.resultDispatcher = new ResultDispatcher(
      this.ctx,
      this.overlayService,
      {
        audioPipeline: this.audioPipeline,
        getRecorderState: () => this.ctx.state,
        getProviderMode: () => this.provider.mode,
        getUserStats: () => this.settingsCache.cachedUserStats,
        setUserStats: (stats) => this.settingsCache.setUserStats(stats),
        getActiveChatPreset: () => this.getActiveChatPreset(),
        buildProviderMetadata: (r) => this.buildProviderMetadata(r),
        resetToIdleFn: (opts) => this.resetToIdle(opts),
        handleTextInsertionFn: (text, opts) => this.textInserter.handleTextInsertion(text, opts),
      },
    )
  }

  // ─── Public API（保持 facade 兼容）───

  setStateListener(cb: (s: RecorderState) => void) {
    this.onStateChange = cb
  }

  getState(): RecorderState {
    return this.ctx.state
  }

  setPttSuppressed(suppressed: boolean) {
    this.ctx.pttSuppressed = suppressed
  }

  async init() {
    if (this.initialized) return
    this.initialized = true

    startInsertionTargetTracking()
    await this.refreshRuntimeSettings()
    this.ensureConnection()

    // 注册 Tauri 事件并保存 unlisten 句柄，cleanup 时统一释放
    const track = <T>(unlisten: () => T) => {
      this.unlistenFns.push(unlisten as () => void)
    }

    track(bridge.onPTTDown((payload) => {
      this.notePTTDown(payload)
      this.logPTTEvent('down', payload)
      if (this.ctx.pttSuppressed || this.ctx.handsFreeMode) {
        addRuntimeEvent('info', 'ptt', 'event:down ignored', {
          ...this.getPTTEventContext(payload),
          ignoreReason: this.ctx.pttSuppressed ? 'ptt_suppressed' : 'hands_free_mode',
        })
        return
      }
      if (this.ctx.state === 'idle') {
        addRuntimeEvent('info', 'ptt', 'event:down accepted -> startRecording', this.getPTTEventContext(payload))
        void this.startRecording()
        return
      }
      addRuntimeEvent('info', 'ptt', 'event:down ignored', {
        ...this.getPTTEventContext(payload),
        ignoreReason: 'state_not_idle',
      })
    }))

    track(bridge.onPTTUp((payload) => {
      this.notePTTUp(payload)
      this.logPTTEvent('up', payload)
      if (this.ctx.pttSuppressed || this.ctx.handsFreeMode) {
        addRuntimeEvent('info', 'ptt', 'event:up ignored', {
          ...this.getPTTEventContext(payload),
          ignoreReason: this.ctx.pttSuppressed ? 'ptt_suppressed' : 'hands_free_mode',
        })
        return
      }
      if (this.ctx.state === 'recording') {
        addRuntimeEvent('info', 'ptt', 'event:up accepted -> stopRecording', this.getPTTEventContext(payload))
        void this.stopRecording()
        return
      }
      if (this.ctx.startRecordingLock) {
        addRuntimeEvent('info', 'ptt', 'event:up deferred — startRecording in progress', this.getPTTEventContext(payload))
        this.ctx.pendingStopWhileStarting = true
        return
      }
      addRuntimeEvent('info', 'ptt', 'event:up ignored', {
        ...this.getPTTEventContext(payload),
        ignoreReason: 'state_not_recording',
      })
    }))

    track(bridge.onPTTToggle((payload) => {
      this.logPTTEvent('toggle', payload)
      if (this.ctx.pttSuppressed || this.ctx.handsFreeMode) {
        addRuntimeEvent('info', 'ptt', 'event:toggle ignored', {
          ...this.getPTTEventContext(payload),
          ignoreReason: this.ctx.pttSuppressed ? 'ptt_suppressed' : 'hands_free_mode',
        })
        return
      }
      addRuntimeEvent('info', 'ptt', 'event:toggle accepted', this.getPTTEventContext(payload))
      this.pttToggle(false)
    }))

    track(bridge.onToggleHandsFree((payload) => {
      this.logPTTEvent('hands_free', payload)
      if (this.ctx.pttSuppressed) {
        addRuntimeEvent('info', 'ptt', 'event:hands_free ignored', {
          ...this.getPTTEventContext(payload),
          ignoreReason: 'ptt_suppressed',
        })
        return
      }
      addRuntimeEvent('info', 'ptt', 'event:hands_free accepted', this.getPTTEventContext(payload))
      this.pttToggle(true)
    }))

    track(bridge.onPTTTimeoutWarning(() => {
      if (this.ctx.state === 'recording') {
        addRuntimeEvent('warn', 'recorder', '录音即将达到 5 分钟上限')
        this.overlayService.showTimeoutWarning()
      }
    }))

    track(bridge.onAIChatPTTDown((payload) => {
      this.logAIChatEvent('down', payload)
      if (this.ctx.pttSuppressed || this.ctx.handsFreeMode) {
        addRuntimeEvent('info', 'ai-chat', 'event:down ignored', {
          ...this.getPTTEventContext(payload),
          ignoreReason: this.ctx.pttSuppressed ? 'ptt_suppressed' : 'hands_free_mode',
        })
        return
      }
      if (this.ctx.state === 'idle') {
        addRuntimeEvent('info', 'ai-chat', 'event:down accepted -> startRecording (AI Chat)', this.getPTTEventContext(payload))
        this.ctx.isAIChatMode = true
        void this.startRecording()
        return
      }
      addRuntimeEvent('info', 'ai-chat', 'event:down ignored', {
        ...this.getPTTEventContext(payload),
        ignoreReason: 'state_not_idle',
      })
    }))

    track(bridge.onAIChatPTTUp((payload) => {
      this.logAIChatEvent('up', payload)
      if (this.ctx.pttSuppressed || this.ctx.handsFreeMode) {
        addRuntimeEvent('info', 'ai-chat', 'event:up ignored', {
          ...this.getPTTEventContext(payload),
          ignoreReason: this.ctx.pttSuppressed ? 'ptt_suppressed' : 'hands_free_mode',
        })
        return
      }
      if (this.ctx.state === 'recording') {
        addRuntimeEvent('info', 'ai-chat', 'event:up accepted -> stopRecording', this.getPTTEventContext(payload))
        void this.stopRecording()
        return
      }
      if (this.ctx.startRecordingLock) {
        addRuntimeEvent('info', 'ai-chat', 'event:up deferred — startRecording in progress', this.getPTTEventContext(payload))
        this.ctx.pendingStopWhileStarting = true
        return
      }
      addRuntimeEvent('info', 'ai-chat', 'event:up ignored', {
        ...this.getPTTEventContext(payload),
        ignoreReason: 'state_not_recording',
      })
    }))
  }

  cleanup() {
    this.clearProcessingTimeout()
    this.overlayService.dispose()
    stopInsertionTargetTracking()
    void stopCapture().catch(() => {})
    this.provider.disconnect()
    while (this.unlistenFns.length > 0) {
      const unlisten = this.unlistenFns.pop()
      try { unlisten?.() } catch { /* ignore */ }
    }
  }

  async refreshRuntimeSettings(): Promise<void> {
    await this.settingsCache.refresh()
  }

  reconnectProvider() {
    this.ensureConnection()
  }

  async refreshOverlaySettings(): Promise<void> {
    await this.settingsCache.refreshOverlay()
  }

  updateMouseSettings(key: 'mouse_ptt' | 'scroll_up' | 'scroll_down', enabled: boolean): void {
    this.settingsCache.updateMouseSettings(key, enabled)
  }

  // ─── State machine ───

  private transition(to: RecorderState): boolean {
    if (!isValidTransition(this.ctx.state, to)) {
      addRuntimeEvent('warn', 'recorder', `非法状态转移 ${this.ctx.state} → ${to}，已忽略`)
      return false
    }
    addRuntimeEvent('info', 'recorder', '状态切换', { from: this.ctx.state, to })
    this.ctx.state = to
    this.onStateChange?.(to)
    return true
  }

  private clearProcessingTimeout() {
    if (this.ctx.processingTimeoutId) {
      clearTimeout(this.ctx.processingTimeoutId)
      this.ctx.processingTimeoutId = null
    }
  }

  private getLiveElapsedSec() {
    if (this.ctx.state === 'recording' && this.ctx.recordStartPerf > 0) {
      return (performance.now() - this.ctx.recordStartPerf) / 1000
    }
    return this.getAudioDurationSec()
  }

  private getAudioDurationSec() {
    return this.ctx.audioSentSamples > 0 ? this.ctx.audioSentSamples / 16000 : 0
  }

  // ─── resetToIdle ───

  private resetToIdle(options?: ResetToIdleOptions) {
    addRuntimeEvent('info', 'recorder', '重置到 idle', {
      fromState: this.ctx.state,
      keepOverlay: Boolean(options?.keepOverlay),
      handsFreeMode: this.ctx.handsFreeMode,
      textInsertionInFlight: this.ctx.textInsertionInFlight,
    })
    this.clearProcessingTimeout()
    if (this.ctx.handsFreeAutoStopId) {
      clearTimeout(this.ctx.handsFreeAutoStopId)
      this.ctx.handsFreeAutoStopId = null
    }
    this.overlayService.stopListeningTicker()
    this.overlayService.resetWarnings()
    this.overlayService.clearSelectionIndicator()
    this.ctx.startRecordingLock = false
    this.ctx.pendingStopWhileStarting = false
    this.ctx.handsFreeMode = false
    this.ctx.isAIChatMode = false
    this.ctx.finalHandledInCurrentRun = false
    this.ctx.textInsertionInFlight = false
    this.ctx.captureReadyPromise = null
    this.ctx.finalReceivedAt = 0
    this.ctx.currentActiveAppContext = null
    this.ctx.currentPromptResolution = null
    this.ctx.cachedProbeResult = null
    this.ctx.capturedSelection = null
    this.audioPipeline.reset()
    this.previewEngine.reset()
    clearCapturedInsertionTarget()
    this.ctx.recordStartPerf = 0
    if (!options?.preserveLateFinalContext) {
      this.ctx.timedOutProcessingContext = null
    }
    this.transition('idle')
    if (!options?.keepOverlay) {
      this.overlayService.clearFallbackHideTimer()
      this.overlayService.hide()
    }
  }

  // ─── Provider callbacks ───

  private buildProviderCallbacks(): TranscriptionCallbacks {
    return {
      onPartial: (text, isFinal) => {
        this.previewEngine.onProviderPartial(text, isFinal)
      },
      onASR: (_result) => {
        // 见 buildProviderCallbacks.onASR 旧注释：故意留空，等 onFinal
        if (this.ctx.state !== 'processing') return
        if (this.ctx.finalHandledInCurrentRun) return
      },
      onFinal: (result) => {
        if (this.ctx.state !== 'processing') {
          const lateContext = this.consumeTimedOutProcessingContext()
          if (!lateContext) return

          addRuntimeEvent('warn', 'recorder', '收到迟到 final，补处理已超时会话', {
            timedOutAt: lateContext.timedOutAt,
            lateByMs: Date.now() - lateContext.timedOutAt,
            durationSec: result.durationSec,
            asrMs: result.asrMs,
            llmMs: result.llmMs,
          })
          if (this.ctx.isAIChatMode) {
            void this.resultDispatcher.processAIChatResult(result, lateContext, { allowInsertionWhenIdle: true, source: 'late_after_timeout' })
            return
          }
          void this.resultDispatcher.processFinalResult(result, lateContext, { allowInsertionWhenIdle: true, source: 'late_after_timeout' })
          return
        }
        if (this.ctx.finalHandledInCurrentRun) {
          addRuntimeEvent('warn', 'recorder', '忽略重复 final 消息')
          return
        }
        this.ctx.finalHandledInCurrentRun = true
        this.ctx.finalReceivedAt = Date.now()

        const localAudioDur = this.getAudioDurationSec()
        devLog('[ptt-diag] onFinal', {
          backendDurationSec: result.durationSec,
          localAudioDurSec: localAudioDur.toFixed(2),
          audioSentSamples: this.ctx.audioSentSamples,
          asrMs: result.asrMs,
          llmMs: result.llmMs,
          isAIChatMode: this.ctx.isAIChatMode,
        })

        const context: TimedOutProcessingContext = {
          timedOutAt: 0,
          audioDurationSec: this.getAudioDurationSec(),
          wallTimeSec: this.ctx.wallTimeAtStopSec > 0 ? this.ctx.wallTimeAtStopSec : this.getAudioDurationSec(),
          promptResolution: this.ctx.currentPromptResolution ? { ...this.ctx.currentPromptResolution } : null,
          appContext: this.ctx.currentActiveAppContext ? { ...this.ctx.currentActiveAppContext } : null,
        }

        if (this.ctx.isAIChatMode) {
          void this.resultDispatcher.processAIChatResult(result, context, { allowInsertionWhenIdle: false, source: 'processing' })
          return
        }
        void this.resultDispatcher.processFinalResult(result, context, { allowInsertionWhenIdle: false, source: 'processing' })
      },

      onDone: () => {
        if (this.ctx.state !== 'processing') return
        if (this.ctx.finalHandledInCurrentRun) return
        if (this.ctx.textInsertionInFlight) return
        this.resetToIdle()
      },

      onError: (msg) => {
        if (this.ctx.state === 'recording') {
          this.overlayService.stopListeningTicker()
          void stopCapture().catch(() => {})
        }
        void this.resultDispatcher.onError(msg)
      },
    }
  }

  // ─── Connection management ───

  private ensureConnection() {
    if (this.provider.isReady()) return
    this.provider.connect(this.buildProviderCallbacks()).catch((err) => {
      addRuntimeEvent('warn', 'websocket', '预连接失败，5s 后重试', { error: String(err) })
      setTimeout(() => this.ensureConnection(), 5000)
    })
  }

  // ─── Recording lifecycle ───

  private async startRecording() {
    if (this.ctx.state !== 'idle' || this.ctx.startRecordingLock) {
      addRuntimeEvent('info', 'recorder', '开始录音请求已忽略', { state: this.ctx.state, locked: this.ctx.startRecordingLock })
      return
    }
    this.ctx.startRecordingLock = true
    this.ctx.pendingStopWhileStarting = false
    this.ctx.timedOutProcessingContext = null

    const targetCapture = captureActiveInsertionTarget(undefined, { preserveExistingOnFailure: true })
    let activeAppContext: ActiveAppContext | null = null
    try {
      activeAppContext = await bridge.getActiveAppContext()
    } catch {
      activeAppContext = null
    }
    this.ctx.currentActiveAppContext = activeAppContext

    try {
      this.ctx.cachedProbeResult = await this.pasteService.getProbeResult()
      addRuntimeEvent('info', 'recorder', '录音开始时 probe 已缓存', {
        probeId: this.ctx.cachedProbeResult.probeId,
        hwnd: this.ctx.cachedProbeResult.hwnd,
        focusHwnd: this.ctx.cachedProbeResult.focusHwnd,
        editable: this.ctx.cachedProbeResult.editable,
        process: this.ctx.cachedProbeResult.process,
        verdict: this.ctx.cachedProbeResult.verdict,
      })
    } catch {
      this.ctx.cachedProbeResult = null
    }

    if (this.ctx.isAIChatMode) {
      try {
        const sel = await bridge.captureSelection()
        if (sel.available && sel.text.trim()) {
          if (sel.length > SELECTION_MAX_LENGTH) {
            addRuntimeEvent('warn', 'recorder', '选区过长，已取消', { length: sel.length })
            this.overlayService.showError(`选区过长（${sel.length} 字），已取消`)
            this.ctx.cachedProbeResult = null
            this.ctx.capturedSelection = null
            this.ctx.startRecordingLock = false
            this.resetToIdle()
            return
          }
          this.ctx.capturedSelection = { text: sel.text, hwnd: sel.hwnd, length: sel.length }
          this.overlayService.showSelectionIndicator(sel.length, sel.controlType)
          addRuntimeEvent('info', 'recorder', '选区已捕获', {
            length: sel.length,
            hwnd: sel.hwnd,
            controlType: sel.controlType,
            automationId: sel.automationId,
            preview: sel.text.length > 40 ? sel.text.slice(0, 40) + '...' : sel.text,
          })
        } else {
          this.ctx.capturedSelection = null
          addRuntimeEvent('info', 'recorder', 'AI 对话模式：未检测到选区，退回普通 AI 对话')
        }
      } catch (err) {
        this.ctx.capturedSelection = null
        addRuntimeEvent('warn', 'recorder', '选区捕获失败，退回普通 AI 对话', { error: String(err) })
      }
    } else {
      this.ctx.capturedSelection = null
    }

    this.ctx.currentPromptResolution = resolvePromptRouting({
      appContext: activeAppContext,
      presets: this.settingsCache.cachedPresets,
      activePresetId: this.settingsCache.cachedActivePresetId,
      appRules: this.settingsCache.cachedAppPromptRules,
      userStats: this.settingsCache.cachedUserStats,
    })

    addRuntimeEvent('info', 'recorder', '开始录音', {
      micId: this.settingsCache.cachedMicId || 'default',
      preset: this.ctx.currentPromptResolution.preset.id || this.ctx.currentPromptResolution.preset.name || 'none',
      targetCapture,
      appContext: this.summarizeAppContext(activeAppContext || null),
      promptRouting: {
        appId: this.ctx.currentPromptResolution.appId,
        appName: this.ctx.currentPromptResolution.appName,
        presetId: this.ctx.currentPromptResolution.preset.id,
        presetName: this.ctx.currentPromptResolution.preset.name,
        promptRuleId: this.ctx.currentPromptResolution.matchedRule?.id,
        summary: this.ctx.currentPromptResolution.summary,
      },
    })

    this.overlayService.clearFallbackHideTimer()
    this.overlayService.showWaiting()

    this.ctx.finalHandledInCurrentRun = false
    this.ctx.recordStartPerf = 0
    this.ctx.wallTimeAtStopSec = 0

    // 启动 AudioPipeline（新 sessionId + 重置）
    this.audioPipeline.startSession()
    // 启动 PreviewEngine（新 sessionId + 清空段缓冲）
    this.previewEngine.startSession()

    // 5-min hands-free auto-stop
    const armHandsFreeTimer = () => {
      if (!this.ctx.handsFreeMode) return
      this.ctx.handsFreeAutoStopId = setTimeout(() => {
        if (this.ctx.state === 'recording' && this.ctx.handsFreeMode) {
          addRuntimeEvent('warn', 'recorder', '免提模式即将达到 5 分钟上限')
          this.overlayService.showTimeoutWarning()
          this.ctx.handsFreeAutoStopId = setTimeout(() => {
            if (this.ctx.state === 'recording' && this.ctx.handsFreeMode) {
              addRuntimeEvent('warn', 'recorder', '免提模式 5 分钟到达，自动停止')
              void this.stopRecording()
            }
          }, HANDS_FREE_AUTO_STOP_MS)
        }
      }, HANDS_FREE_WARN_DELAY_MS)
    }

    const promptOpts = this.ctx.currentPromptResolution
      ? {
          systemPrompt: this.settingsCache.cachedAiEnabled && !this.ctx.isAIChatMode ? this.ctx.currentPromptResolution.systemPrompt : undefined,
          disableAi: !this.settingsCache.cachedAiEnabled || this.ctx.isAIChatMode,
          clientMeta: this.settingsCache.cachedClientRuntimeInfo,
          appContext: activeAppContext,
          hotwords: this.settingsCache.cachedHotwords.length > 0 ? this.settingsCache.cachedHotwords : undefined,
          language: this.settingsCache.cachedLanguage || undefined,
          polishStyle: resolvePolishStyle(activeAppContext),
        }
      : {
          disableAi: !this.settingsCache.cachedAiEnabled || this.ctx.isAIChatMode,
          clientMeta: this.settingsCache.cachedClientRuntimeInfo,
          appContext: activeAppContext,
          hotwords: this.settingsCache.cachedHotwords.length > 0 ? this.settingsCache.cachedHotwords : undefined,
          language: this.settingsCache.cachedLanguage || undefined,
          polishStyle: 'auto' as const,
        }

    let resolveCaptureReady: () => void
    this.ctx.captureReadyPromise = new Promise<void>((resolve) => { resolveCaptureReady = resolve })

    // 设置 partial sessionId（cloud_api 流式 ASR 用）
    if (this.provider.mode === 'cloud_api') {
      const cloudProvider = this.provider as unknown as { setPartialSessionId?: (id: string | null) => void }
      if (typeof cloudProvider.setPartialSessionId === 'function') {
        cloudProvider.setPartialSessionId(this.previewEngine.getPreviewSessionId())
      }
    }

    try {
      const [, captureResult] = await Promise.all([
        this.provider.connect(this.buildProviderCallbacks()),
        startCapture(
          this.settingsCache.cachedMicId || undefined,
          (buffer) => {
            this.audioPipeline.onAudioBuffer(buffer)
            this.provider.sendAudio(buffer)
          },
          undefined,
          (pcmFrame) => {
            const stats = this.audioPipeline.onPcmFrame(pcmFrame)
            // 计算 RMS（PreviewEngine 需要做切段判定）
            let sum = 0
            for (let i = 0; i < pcmFrame.length; i++) sum += pcmFrame[i] * pcmFrame[i]
            const rms = Math.sqrt(sum / pcmFrame.length) / 32768
            this.previewEngine.onPcmFrame(pcmFrame, rms)
            void stats
          },
        ),
      ])
      resolveCaptureReady!()

      const started = this.provider.start(promptOpts)
      if (!started) throw new Error('sendStart failed')
      addRuntimeEvent('info', 'recorder', '已发送 start，开始采集音频')

      this.ctx.recordStartPerf = performance.now()
      if (!this.transition('recording')) {
        this.ctx.startRecordingLock = false
        return
      }
      this.ctx.startRecordingLock = false
      this.overlayService.startListeningTicker()
      armHandsFreeTimer()

      if (this.ctx.pendingStopWhileStarting) {
        this.ctx.pendingStopWhileStarting = false
        addRuntimeEvent('info', 'recorder', 'PTT up 在初始化期间到达，立即停止录音')
        void this.stopRecording()
        return
      }
    } catch (error) {
      resolveCaptureReady!()
      this.ctx.startRecordingLock = false
      this.ctx.pendingStopWhileStarting = false
      addRuntimeEvent('error', 'recorder', '开始录音失败', { error: String(error) })
      try { await stopCapture() } catch { /* ignore */ }
      this.provider.stop({ pttHoldMs: this.ctx.recordStartPerf > 0 ? (performance.now() - this.ctx.recordStartPerf) : 0 })
      const errMsg = String(error)
      if (errMsg.includes('麦克风') || errMsg.includes('microphone') || errMsg.includes('audio')) {
        this.overlayService.showError('麦克风不可用')
      } else {
        this.overlayService.showError('录音启动失败')
      }
      this.resetToIdle({ keepOverlay: true })
    }
  }

  private async stopRecording() {
    if (this.ctx.state !== 'recording') {
      addRuntimeEvent('info', 'recorder', '停止录音请求已忽略', { state: this.ctx.state })
      return
    }

    if (this.ctx.captureReadyPromise) {
      try {
        await Promise.race([
          this.ctx.captureReadyPromise,
          new Promise<void>((resolve) => setTimeout(resolve, START_CAPTURE_WAIT_MS)),
        ])
      } catch { /* ignore */ }
      this.ctx.captureReadyPromise = null
    }

    this.overlayService.stopListeningTicker()
    addRuntimeEvent('info', 'recorder', '停止录音')

    try { await stopCapture() } catch (error) {
      addRuntimeEvent('error', 'recorder', '停止采集失败', { error: String(error) })
    }

    const audioDur = this.getAudioDurationSec()
    const pttHoldMs = this.ctx.recordStartPerf > 0 ? (performance.now() - this.ctx.recordStartPerf) : 0
    const wallTimeSec = pttHoldMs / 1000
    this.ctx.wallTimeAtStopSec = wallTimeSec
    devLog('[ptt-diag] stopRecording', {
      audioSentSamples: this.ctx.audioSentSamples,
      audioDurSec: audioDur.toFixed(2),
      wallTimeSec: wallTimeSec.toFixed(2),
      durationRatio: pttHoldMs > 0 ? (audioDur / wallTimeSec).toFixed(3) : 'N/A',
    })

    const durationRatio = wallTimeSec > 0 ? audioDur / wallTimeSec : 1
    if (wallTimeSec > 1 && (durationRatio > 2.0 || durationRatio < 0.3)) {
      addRuntimeEvent('warn', 'recorder', '音频数据量异常，可能采样率不匹配', {
        audioDurSec: audioDur.toFixed(2),
        wallTimeSec: wallTimeSec.toFixed(2),
        durationRatio: durationRatio.toFixed(3),
        audioSentSamples: this.ctx.audioSentSamples,
        recordedChunksCount: this.ctx.recordedChunks.length,
        recordedChunksTotalBytes: this.ctx.recordedChunks.reduce((s, c) => s + c.byteLength, 0),
      })
    }
    const stats = this.audioPipeline.snapshotStats()
    this.provider.stop({
      pttHoldMs,
      audioStats: stats,
    })
    addRuntimeEvent('info', 'recorder', '已发送 stop', { audioSec: audioDur, pttHoldMs: Math.round(pttHoldMs) })

    const hasSelectionForShortCircuit = !!(this.ctx.capturedSelection && this.ctx.capturedSelection.text.trim())
    const silenceRatio = this.audioPipeline.getSilenceRatio()
    const isPureSilence = silenceRatio >= SHORT_AUDIO_SILENCE_RATIO
    if (audioDur < SHORT_AUDIO_DISCARD_SEC && isPureSilence && !hasSelectionForShortCircuit) {
      addRuntimeEvent('info', 'recorder', '录音过短且纯静音且无选区，直接丢弃（防误触）', {
        audioSec: audioDur.toFixed(2),
        silenceRatio: silenceRatio.toFixed(3),
      })
      this.resetToIdle()
      return
    }

    if (!this.transition('processing')) return

    const processingTimeoutMs = _computeProcessingTimeoutMs(audioDur, this.provider.mode)
    addRuntimeEvent('info', 'recorder', '进入 processing', {
      audioSec: audioDur,
      timeoutMs: processingTimeoutMs,
    })
    this.overlayService.showThinking(audioDur)
    this.ctx.processingTimeoutId = setTimeout(() => {
      if (this.ctx.state !== 'processing') return
      if (this.ctx.textInsertionInFlight) {
        addRuntimeEvent('warn', 'recorder', '处理超时但文本插入仍在进行，延长等待')
        return
      }
      this.ctx.timedOutProcessingContext = {
        timedOutAt: Date.now(),
        audioDurationSec: audioDur,
        wallTimeSec,
        promptResolution: this.ctx.currentPromptResolution ? { ...this.ctx.currentPromptResolution } : null,
        appContext: this.ctx.currentActiveAppContext ? { ...this.ctx.currentActiveAppContext } : null,
      }
      addRuntimeEvent('warn', 'recorder', '处理超时，自动回到空闲状态', {
        audioSec: audioDur,
        timeoutMs: processingTimeoutMs,
        lateFinalGraceMs: LATE_FINAL_GRACE_MS,
      })
      this.resetToIdle({ preserveLateFinalContext: true })
    }, processingTimeoutMs)
  }

  // ─── PTT toggle / hands-free ───

  /** Public entry: 触发一次 hands-free 切换（与按免提快捷键等效）。供 UI 按钮调用。 */
  toggleHandsFree(): void {
    this.pttToggle(true)
  }

  private pttToggle(isHandsFree = false) {
    const now = Date.now()
    if (now - this.ctx.lastToggleTime < PTT_TOGGLE_COOLDOWN_MS) {
      addRuntimeEvent('info', 'ptt', 'toggle 请求已忽略', {
        isHandsFree,
        ignoreReason: 'cooldown',
        recorderState: this.ctx.state,
      })
      return
    }
    this.ctx.lastToggleTime = now

    if (this.ctx.state === 'idle') {
      if (isHandsFree) {
        this.ctx.handsFreeMode = true
        this.ctx.pttSuppressed = true
        setTimeout(() => { this.ctx.pttSuppressed = false }, 500)
      }
      addRuntimeEvent('info', 'ptt', 'toggle -> startRecording', {
        isHandsFree,
        recorderState: this.ctx.state,
      })
      void this.startRecording()
      return
    }

    if (this.ctx.state === 'recording') {
      if (isHandsFree || !this.ctx.handsFreeMode) {
        this.ctx.handsFreeMode = false
        addRuntimeEvent('info', 'ptt', 'toggle -> stopRecording', {
          isHandsFree,
          recorderState: this.ctx.state,
        })
        void this.stopRecording()
      }
      return
    }

    addRuntimeEvent('info', 'ptt', 'toggle 请求已忽略', {
      isHandsFree,
      ignoreReason: 'state_not_toggleable',
      recorderState: this.ctx.state,
      handsFreeMode: this.ctx.handsFreeMode,
    })
  }

  // ─── PTT helper methods ───

  private getPTTEventContext(payload?: unknown) {
    const p = (payload && typeof payload === 'object')
      ? (payload as PTTEventPayload)
      : {}
    return {
      source: p.source || 'unknown',
      keycode: p.keycode,
      rawcode: p.rawcode,
      modifiers: {
        alt: p.altKey,
        ctrl: p.ctrlKey,
        shift: p.shiftKey,
      },
      reason: p.reason,
      pttSetting: p.pttSetting,
      timestamp: p.timestamp,
      recorderState: this.ctx.state,
      handsFreeMode: this.ctx.handsFreeMode,
      pttSuppressed: this.ctx.pttSuppressed,
    }
  }

  private logPTTEvent(event: 'down' | 'up' | 'toggle' | 'hands_free', payload?: unknown) {
    addRuntimeEvent('info', 'ptt', `event:${event}`, this.getPTTEventContext(payload))
  }

  private logAIChatEvent(event: 'down' | 'up', payload?: unknown) {
    addRuntimeEvent('info', 'ai-chat', `event:${event}`, this.getPTTEventContext(payload))
  }

  private notePTTDown(payload?: unknown) {
    const p = (payload && typeof payload === 'object')
      ? (payload as PTTEventPayload)
      : {}
    this.ctx.lastPTTUpUsedModifier = Boolean(
      p.altKey || p.ctrlKey || p.shiftKey || _isModifierPTTSetting(p.pttSetting),
    )
  }

  private notePTTUp(payload?: unknown) {
    const p = (payload && typeof payload === 'object')
      ? (payload as PTTEventPayload)
      : {}
    this.ctx.lastPTTUpAt = Date.now()
    this.ctx.lastPTTUpUsedModifier = Boolean(
      p.altKey || p.ctrlKey || p.shiftKey || _isModifierPTTSetting(p.pttSetting),
    )
  }

  private async waitForModifierPTTReleaseIfNeeded() {
    if (!this.ctx.lastPTTUpUsedModifier || this.ctx.lastPTTUpAt <= 0) return
    const elapsedMs = Date.now() - this.ctx.lastPTTUpAt
    if (elapsedMs >= MODIFIER_PTT_RELEASE_GUARD_MS) return
    const waitMs = MODIFIER_PTT_RELEASE_GUARD_MS - elapsedMs
    addRuntimeEvent('info', 'recorder', '等待修饰键释放稳定后再注入文本', {
      waitMs,
      lastPTTUpAt: this.ctx.lastPTTUpAt,
    })
    await new Promise((resolve) => setTimeout(resolve, waitMs))
  }

  // ─── Misc helpers (used by ResultDispatcher via deps.buildProviderMetadata) ───

  private summarizeAppContext(context: ActiveAppContext | null) {
    if (!context) return null
    return {
      processName: context.processName,
      exePath: context.exePath,
      windowTitle: context.windowTitle,
      windowClass: context.windowClass,
      focusClass: context.focusClass,
      controlType: context.controlType,
      focusedName: context.focusedName,
    }
  }

  /** 异步获取当前模式下的 ASR/AI 供应商信息 — 给历史记录展示用 */
  private async buildProviderMetadata(finalResult?: { asrEngine?: string; asrModel?: string }): Promise<{
    asrProvider?: string
    aiProvider?: string
    aiModel?: string
  }> {
    const mode = this.provider.mode
    if (mode === 'server') {
      let asrProvider = finalResult?.asrModel || finalResult?.asrEngine || 'server'
      const slashIdx = asrProvider.lastIndexOf('/')
      if (slashIdx >= 0) asrProvider = asrProvider.slice(slashIdx + 1)
      return { asrProvider, aiProvider: 'server' }
    }
    if (mode === 'cloud_api') {
      const asrProviderKey = await getSetting('cloudAsr.provider', '') as string
      const ASR_MODEL_ID_MAP: Record<string, string> = {
        doubao_v2: 'Doubao-Seed-ASR-2.0',
        qwen: 'qwen3-asr-flash',
        qwen_omni_35_plus: 'qwen3.5-omni-plus-realtime',
        qwen_omni_35_flash: 'qwen3.5-omni-flash-realtime',
        qwen_omni_flash: 'qwen3-omni-flash-realtime',
        qwen_omni_turbo: 'qwen-omni-turbo-realtime',
        qwen_omni_plus: 'qwen3.5-omni-plus-realtime',
        zhipu: 'glm-asr-2512',
      }
      const asrProvider = ASR_MODEL_ID_MAP[asrProviderKey] || asrProviderKey || 'cloud'
      const aiProvider = await getSetting('cloudAi.provider', '') as string
      const aiModel = await getSetting('cloudAi.model', '') as string
      return { asrProvider, aiProvider: aiProvider || undefined, aiModel: aiModel || undefined }
    }
    if (mode === 'local') {
      const modelId = await getSetting('localAsr.modelId', '') as string
      const aiEnabled = Boolean(await getSetting('aiEnabled', false))
      const aiProvider = aiEnabled ? await getSetting('cloudAi.provider', '') as string : undefined
      const aiModel = aiEnabled ? await getSetting('cloudAi.model', '') as string : undefined
      return { asrProvider: modelId || 'local', aiProvider, aiModel: aiModel || undefined }
    }
    return {}
  }

  /** 给 ResultDispatcher 取当前激活的 AI chat preset */
  private getActiveChatPreset() {
    const activeId = this.settingsCache.cachedActiveChatPresetId
    return this.settingsCache.cachedPresets.find((p) => p.id === activeId)
  }

  private consumeTimedOutProcessingContext() {
    if (!this.ctx.timedOutProcessingContext) return null
    const context = this.ctx.timedOutProcessingContext
    this.ctx.timedOutProcessingContext = null
    if (Date.now() - context.timedOutAt > LATE_FINAL_GRACE_MS) {
      return null
    }
    return context
  }
}