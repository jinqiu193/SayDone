export type RecorderState = 'idle' | 'recording' | 'processing'

export type OverlayWidthPreset = 'short' | 'medium' | 'long'

export interface OverlayWidthConfig {
  barCount: number
  windowWidth: number
}

export const OVERLAY_WIDTH_PRESETS: Record<OverlayWidthPreset, OverlayWidthConfig> = {
  short:  { barCount: 12, windowWidth: 200 },
  medium: { barCount: 18, windowWidth: 280 },
  long:   { barCount: 24, windowWidth: 360 },
}

export interface OverlayCommonPayload {
  showDuration: boolean
  baseWidth?: number
  barCount?: number
  position?: 'bottom' | 'top'
}

/** 流式 ASR 预览：在 listening 状态覆盖 bars 显示的最新识别文本（替换式）。
 *  与 OverlayCommonPayload 平级作为顶层可选字段，由 Rust 透传到 overlay window。 */
export interface OverlayPreviewPayload {
  previewText?: string
  previewKey?: number
}

export interface PTTEventPayload {
  source?: string
  keycode?: number
  rawcode?: number
  altKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  reason?: string
  pttSetting?: string
  timestamp?: number
}

/** RecorderOrchestrator 与各子模块共享的运行时上下文。
 *
 * 拆分 RecorderOrchestrator 时，把跨子模块需要读写的字段集中到这一个 ctx 对象，
 * 子模块构造时拿到 ctx 引用，通过 ctx.xxx 读写；不再持有副本避免不一致。
 *
 * 设计原则：
 * - **不持有 Orchestrator 实例**，避免循环依赖；
 * - **字段就近分组**：lifecycle / per-run / shared；
 * - 子模块私有字段（如 waveform state）保留在子模块自身。
 */
export interface RecorderContext {
  // ── Lifecycle ──
  state: RecorderState
  handsFreeMode: boolean
  isAIChatMode: boolean
  /** Set when CTRL key is held during PTT — enables template matching mode */
  isTemplateMode: boolean
  /** Lock to prevent re-entrant startRecording during async setup */
  startRecordingLock: boolean
  /** PTT up arrived while startRecording was still initializing — stop immediately after setup */
  pendingStopWhileStarting: boolean
  /** PTT events suppressed during hands-free startup transient (500ms window) */
  pttSuppressed: boolean
  /** processing 超时定时器句柄 — 在 resetToIdle / stopRecording / transition 时清 */
  processingTimeoutId: ReturnType<typeof setTimeout> | null
  /** 5-min hands-free 自动停止定时器 */
  handsFreeAutoStopId: ReturnType<typeof setTimeout> | null
  /** 增量 flush 定时器（每 5s 把 recordedChunks 刷到磁盘） */
  audioFlushTimerId: ReturnType<typeof setInterval> | null
  /** Set when final result has been consumed (prevents duplicate handling) */
  finalHandledInCurrentRun: boolean
  /** Text insertion still in flight, prevents premature idle transition */
  textInsertionInFlight: boolean
  /** Set when startRecording is awaiting capture ready */
  captureReadyPromise: Promise<void> | null
  /** performance.now() captured at startRecording success — for elapsed timing */
  recordStartPerf: number
  /** Total PCM samples sent (used for audio duration display + history) */
  audioSentSamples: number
  /** Wall time captured at stopRecording — for history durationSec */
  wallTimeAtStopSec: number
  /** Monotonic timestamp when onFinal arrived (used for injection latency debug) */
  finalReceivedAt: number
  /** Last PTT down/up timestamps for modifier-PTT release guard */
  lastToggleTime: number
  lastPTTUpAt: number
  lastPTTUpUsedModifier: boolean

  // ── Audio stats（用于短静音比例检测 + 低音量警告） ──
  audioStatsSilentFrames: number
  audioStatsTotalFrames: number

  // ── Incremental WAV write (P2-5) ──
  incrementalRecordId: string
  incrementalFirstChunkWritten: boolean
  incrementalWrittenBytes: number
  /** 上次 flush 时已发送的 sample 数，用于跳过无新数据帧 */
  lastFlushedSamples: number

  // ── Per-run state (set on startRecording, cleared on resetToIdle) ──
  recordedChunks: ArrayBuffer[]
  capturedSelection: { text: string; hwnd: string; length: number } | null
  /** Probe result captured at startRecording — for handleTextInsertion */
  cachedProbeResult: import('./PasteService').ProbeResult | null
  currentPromptResolution: PromptResolution | null
  currentActiveAppContext: ActiveAppContext | null
  /** Context snapshot kept after processing timeout — used to consume a late final */
  timedOutProcessingContext: TimedOutProcessingContext | null
}

import type { ActiveAppContext } from '../../types/appContext'
import type { PromptResolution } from '../personalization/types'

export interface TimedOutProcessingContext {
  timedOutAt: number
  audioDurationSec: number
  wallTimeSec: number
  promptResolution: PromptResolution | null
  appContext: ActiveAppContext | null
}

export const INITIAL_CONTEXT: RecorderContext = {
  state: 'idle',
  handsFreeMode: false,
  isAIChatMode: false,
  isTemplateMode: false,
  startRecordingLock: false,
  pendingStopWhileStarting: false,
  pttSuppressed: false,
  processingTimeoutId: null,
  handsFreeAutoStopId: null,
  audioFlushTimerId: null,
  finalHandledInCurrentRun: false,
  textInsertionInFlight: false,
  captureReadyPromise: null,
  recordStartPerf: 0,
  audioSentSamples: 0,
  wallTimeAtStopSec: 0,
  finalReceivedAt: 0,
  lastToggleTime: 0,
  lastPTTUpAt: 0,
  lastPTTUpUsedModifier: false,
  audioStatsSilentFrames: 0,
  audioStatsTotalFrames: 0,
  incrementalRecordId: '',
  incrementalFirstChunkWritten: false,
  incrementalWrittenBytes: 0,
  lastFlushedSamples: 0,
  recordedChunks: [],
  capturedSelection: null,
  cachedProbeResult: null,
  currentPromptResolution: null,
  currentActiveAppContext: null,
  timedOutProcessingContext: null,
}

/** Stream preview / segment / ASR 配置常量（PCM @ 16kHz） */
export const PREVIEW_MIN_SEG_SAMPLES = 8000   // 0.5s
export const PREVIEW_SILENCE_SAMPLES = 16000  // 1s
export const PREVIEW_SILENCE_RMS_THRESHOLD = 0.005
export const SILENCE_RMS_THRESHOLD = 0.01
/** 极短录音阈值（秒） */
export const SHORT_AUDIO_DISCARD_SEC = 0.5
/** 短静音比例（>= 视为纯静音） */
export const SHORT_AUDIO_SILENCE_RATIO = 0.98
/** Late final 兜底窗口：超过此时间后丢弃 */
export const LATE_FINAL_GRACE_MS = 15000
/** 修饰键 PTT 释放稳定等待时间 */
export const MODIFIER_PTT_RELEASE_GUARD_MS = 200
/** PTT toggle 冷却时间 */
export const PTT_TOGGLE_COOLDOWN_MS = 500
/** Cached probe 有效期（毫秒），过期后重新校验原 hwnd 是否存活 */
export const PROBE_TTL_MS = 8000
/** startRecording 的 capture ready 最大等待时间 */
export const START_CAPTURE_WAIT_MS = 3000
/** 选区长度上限 */
export const SELECTION_MAX_LENGTH = 8000
/** 低音量阈值（PCM RMS） */
export const LOW_VOLUME_RMS_THRESHOLD = 0.0003
/** 低音量首次警告样本数：3s @ 16kHz */
export const LOW_VOLUME_FIRST_WARN_SAMPLES = 48000
/** 低音量重复警告间隔（毫秒） */
export const LOW_VOLUME_REWARN_MS = 5000
/** 增量 flush 间隔（毫秒） */
export const AUDIO_FLUSH_INTERVAL_MS = 5000
/** 免提模式首次警告延迟（4 分钟） */
export const HANDS_FREE_WARN_DELAY_MS = 240_000
/** 免提模式自动停止延迟（警告后 1 分钟） */
export const HANDS_FREE_AUTO_STOP_MS = 60_000
