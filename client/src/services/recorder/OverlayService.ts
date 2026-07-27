import * as bridge from '../bridge'
import { devLog } from '../debugConsole'
import { getSetting } from '../store'
import { clampSec } from '../timeModel'
import { OVERLAY_WIDTH_PRESETS, type OverlayCommonPayload, type OverlayWidthPreset } from './types'
import { isOverlayVisible } from './overlayVisibility'

function normalizeWidthPreset(value: unknown): OverlayWidthPreset {
  if (value === 'short' || value === 'medium' || value === 'long') return value
  return 'long'
}

export class OverlayService {
  private showDuration = true
  private readySoundEnabled = true
  private widthPreset: OverlayWidthPreset = 'medium'
  private position: 'bottom' | 'top' = 'bottom'
  private lastFrameAt = 0
  /** Ticker 节流：仅在 elapsedSec 真正变化时推送（最多每秒 1 次）。 */
  private lastEmittedElapsed = -1
  private tickerId: ReturnType<typeof setInterval> | null = null
  private fallbackHideId: ReturnType<typeof setTimeout> | null = null
  /** Persistent warning text — included in every overlay update until cleared */
  private activeWarning = ''
  /** 选区操作指示：非空时浮窗显示"已选 X 字"标签。resetToIdle 时清空。 */
  private activeSelectionIndicator: { chars: number; controlType?: string } | null = null

  constructor(private readonly getElapsedSec: () => number) {}

  async refreshSettings() {
    this.showDuration = Boolean(await getSetting('overlayShowDuration', true))
    this.readySoundEnabled = Boolean(await getSetting('readySoundEnabled', true))
    this.widthPreset = normalizeWidthPreset(await getSetting('overlayWidth', 'medium'))
    this.position = (await getSetting('overlayPosition', 'bottom')) as 'bottom' | 'top'
  }

  private readySoundCtx: AudioContext | null = null

  private playReadySound() {
    if (!this.readySoundEnabled) return
    try {
      if (!this.readySoundCtx || this.readySoundCtx.state === 'closed') {
        this.readySoundCtx = new AudioContext()
      }
      const ctx = this.readySoundCtx
      if (ctx.state === 'suspended') {
        void ctx.resume()
      }
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.15)
    } catch { /* ignore */ }
  }

  getCommonPayload(): OverlayCommonPayload {
    const cfg = OVERLAY_WIDTH_PRESETS[this.widthPreset]
    return {
      showDuration: this.showDuration,
      baseWidth: cfg.windowWidth,
      barCount: cfg.barCount,
      position: this.position,
    }
  }

  /** 选区指示 payload：透传到浮窗显示"已选 X 字"标签。
   *  - 关键：返回的 `selectionChars: 0` 始终在字段中，让浮窗能区分"无选区"vs"未带字段"
   *    —— 否则不传字段时浮窗 React state 不会更新，旧值会泄漏到下一次录音。
   */
  getSelectionPayload(): { selectionChars: number; selectionControlType: string } {
    if (!this.activeSelectionIndicator) {
      return { selectionChars: 0, selectionControlType: '' }
    }
    return {
      selectionChars: this.activeSelectionIndicator.chars,
      selectionControlType: this.activeSelectionIndicator.controlType ?? '',
    }
  }

  getBarCount(): number {
    return OVERLAY_WIDTH_PRESETS[this.widthPreset].barCount
  }

  showWaiting() {
    devLog('[overlay]', 'state:waiting')
    bridge.showOverlay()
    bridge.updateOverlay({
      state: 'waiting',
      elapsedSec: 0,
      ...this.getCommonPayload(),
      ...this.getSelectionPayload(),
    })
  }

  startListeningTicker() {
    devLog('[overlay]', 'state:listening (start)')
    this.stopListeningTicker()
    this.playReadySound()
    this.lastEmittedElapsed = -1
    this.tickerId = setInterval(() => {
      // 双层节流：
      // 1. 浮窗隐藏时整个 ticker 静音（IPC roundtrip + 队列堆积）
      // 2. 仅在 elapsedSec 真正发生变化时才推（每秒最多 1 次，免得不必要的 IPC）。
      // 警告变化由 showLowVolumeWarning/clearWarning/... 显式推送。
      if (!isOverlayVisible()) return
      const elapsed = clampSec(this.getElapsedSec())
      if (elapsed === this.lastEmittedElapsed) return
      this.lastEmittedElapsed = elapsed
      bridge.updateOverlay({
        state: 'listening',
        elapsedSec: elapsed,
        ...(this.activeWarning ? { warning: this.activeWarning } : {}),
        ...this.getCommonPayload(),
        ...this.getSelectionPayload(),
      })
    }, 250)
  }

  stopListeningTicker() {
    if (this.tickerId) {
      clearInterval(this.tickerId)
      this.tickerId = null
    }
  }

  pushListeningBars(bars?: number[], force = false) {
    // 浮窗隐藏时整个波形推送静音
    if (!isOverlayVisible() && !force) return
    const now = Date.now()
    if (!force && now - this.lastFrameAt < 33) return
    this.lastFrameAt = now
    bridge.updateOverlay({
      state: 'listening',
      bars,
      elapsedSec: clampSec(this.getElapsedSec()),
      ...(this.activeWarning ? { warning: this.activeWarning } : {}),
      ...this.getCommonPayload(),
      ...this.getSelectionPayload(),
    })
  }

  /** 流式 ASR 预览：把局部识别文本推到浮窗，替换波形条显示。
   *  previewKey 用于让 Overlay 区分"已变化" vs "同文本"，避免 React state 被同值 setState 干扰动画。
   *
   *  浮窗是单行胶囊，不能也不应该显示换行 ——
   *  ASR 上游（云 partial / sensevoice 等）偶尔会因为标点 / stream 边界返回带 `\n` 的文本，
   *  这里规范化成空格避免撑容器或显示成多行。 */
  pushListeningPreview(text: string, previewKey: number) {
    if (!isOverlayVisible()) return
    this.lastFrameAt = Date.now()
    const sanitized = (text || '').replace(/[\r\n]+/g, ' ')
    bridge.updateOverlay({
      state: 'listening',
      elapsedSec: clampSec(this.getElapsedSec()),
      previewText: sanitized,
      previewKey,
      ...(this.activeWarning ? { warning: this.activeWarning } : {}),
      ...this.getCommonPayload(),
      ...this.getSelectionPayload(),
    })
  }

  /** 清空预览（录音开始 / reset 时调用，让 Overlay 回到 bars） */
  clearListeningPreview() {
    if (!isOverlayVisible()) return
    this.lastFrameAt = Date.now()
    bridge.updateOverlay({
      state: 'listening',
      elapsedSec: clampSec(this.getElapsedSec()),
      previewText: '',
      previewKey: Date.now(),
      ...(this.activeWarning ? { warning: this.activeWarning } : {}),
      ...this.getCommonPayload(),
      ...this.getSelectionPayload(),
    })
  }

  showThinking(elapsedSec: number) {
    devLog('[overlay]', 'state:thinking', { elapsedSec })
    bridge.updateOverlay({
      state: 'thinking',
      elapsedSec: clampSec(elapsedSec),
      ...this.getCommonPayload(),
      ...this.getSelectionPayload(),
    })
  }

  showAIThinking() {
    devLog('[overlay]', 'state:thinking (AI thinking...)')
    bridge.updateOverlay({
      state: 'thinking',
      elapsedSec: 1,
      thinkingMessage: 'AI 思考中...',
      ...this.getCommonPayload(),
      ...this.getSelectionPayload(),
    })
  }

  /** Show a warning toast on the overlay (e.g. "单次记录最长300s") — persists until recording ends */
  showTimeoutWarning() {
    this.activeWarning = '单次记录最长300s'
    bridge.updateOverlay({
      state: 'listening',
      warning: this.activeWarning,
      elapsedSec: clampSec(this.getElapsedSec()),
      ...this.getCommonPayload(),
      ...this.getSelectionPayload(),
    })
  }

  /** Show low volume warning on the overlay */
  showLowVolumeWarning() {
    // Don't override timeout warning
    if (this.activeWarning) return
    bridge.updateOverlay({
      state: 'listening',
      // 简短提示避免浮窗变形；浮窗侧会再 setTimeout 3s 自动消失
      warning: '麦克风无音',
      elapsedSec: clampSec(this.getElapsedSec()),
      ...this.getCommonPayload(),
      ...this.getSelectionPayload(),
    })
  }

  /** Clear transient warnings (low volume etc.) — does NOT clear timeout warning */
  clearWarning() {
    if (this.activeWarning) return
    bridge.updateOverlay({
      state: 'listening',
      warning: '',
      elapsedSec: clampSec(this.getElapsedSec()),
      ...this.getCommonPayload(),
      ...this.getSelectionPayload(),
    })
  }

  /** Reset all warnings including persistent ones (called on recording stop/reset) */
  resetWarnings() {
    this.activeWarning = ''
  }

  showFallback(text: string, reason: string) {
    devLog('[OverlayService] showFallback called, text:', text.slice(0, 30), 'reason:', reason)
    // Send fallback state to overlay — overlay should already be visible from thinking state.
    // Also send show-overlay as a safety net in case overlay was hidden.
    bridge.updateOverlay({
      state: 'fallback',
      fallbackText: text,
      fallbackReason: reason,
      ...this.getCommonPayload(),
      ...this.getSelectionPayload(),
    })
    bridge.showOverlay()
    this.clearFallbackHideTimer()
    this.fallbackHideId = setTimeout(() => {
      devLog('[OverlayService] fallback auto-hide timer fired')
      bridge.hideOverlay()
      this.clearFallbackHideTimer()
    }, 15000)
  }

  clearFallbackHideTimer() {
    if (this.fallbackHideId) {
      clearTimeout(this.fallbackHideId)
      this.fallbackHideId = null
    }
  }

  hide() {
    bridge.hideOverlay()
  }

  /** 显示错误信息，几秒后自动隐藏 */
  showError(message: string) {
    devLog('[overlay]', 'state:error', { message })
    bridge.updateOverlay({
      state: 'error',
      errorMessage: message,
      ...this.getCommonPayload(),
      ...this.getSelectionPayload(),
    })
    bridge.showOverlay()
    this.clearFallbackHideTimer()
    this.fallbackHideId = setTimeout(() => {
      bridge.hideOverlay()
      this.clearFallbackHideTimer()
    }, 4000)
  }

  /** 显示普通信息提示，几秒后自动隐藏 */
  showInfo(message: string) {
    devLog('[overlay]', 'state:info', { message })
    bridge.updateOverlay({
      state: 'info',
      infoMessage: message,
      ...this.getCommonPayload(),
    })
    bridge.showOverlay()
    this.clearFallbackHideTimer()
    this.fallbackHideId = setTimeout(() => {
      bridge.hideOverlay()
      this.clearFallbackHideTimer()
    }, 3000)
  }

  /** 显示模板处理状态 */
  showTemplateProcessing(templateName: string) {
    devLog('[overlay]', 'state:template', { templateName })
    bridge.updateOverlay({
      state: 'thinking',
      thinkingMessage: `匹配模板: ${templateName}`,
      ...this.getCommonPayload(),
    })
  }

  /** 选区操作：在浮窗显示"已选 X 字"提示，让用户知道正在操作选区。
   *  后续 showWaiting / showAIThinking 调用会通过 listeningPreview 或 thinkingMessage
   *  替代这个指示，state 不变。 */
  showSelectionIndicator(chars: number, controlType?: string) {
    this.activeSelectionIndicator = { chars, controlType }
    devLog('[overlay]', 'selection indicator set', { chars, controlType })
  }

  /** 选区操作：清除指示（resetToIdle / 流程结束时调用） */
  clearSelectionIndicator() {
    this.activeSelectionIndicator = null
  }

  dispose() {
    this.stopListeningTicker()
    this.clearFallbackHideTimer()
    this.clearSelectionIndicator()
    bridge.hideOverlay()
  }
}
