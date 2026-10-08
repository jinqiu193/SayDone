/**
 * RecorderOrchestrator 纯辅助函数
 * 不依赖 this 状态，可独立测试
 */

import type { ActiveAppContext } from '@/types/appContext'

/** 简化 AppContext 用于日志输出 */
export function summarizeAppContext(context: ActiveAppContext | null) {
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

/** 从 AppContext 中提取用于统计的 appId */
export function buildStatsAppId(
  appContext: ActiveAppContext | null,
  promptAppId?: string,
): string {
  const processName = String(appContext?.processName || '').trim()
  if (processName) return processName

  const exePath = String(appContext?.exePath || '').trim()
  if (exePath) {
    const segments = exePath.split(/[\\/]/).filter(Boolean)
    const lastSegment = segments[segments.length - 1]
    if (lastSegment) return lastSegment
  }

  return String(promptAppId || '').trim() || 'unknown'
}

/** 判断 PTT 设置是否为修饰键 */
export function isModifierPTTSetting(pttSetting?: string): boolean {
  return pttSetting === 'AltLeft'
    || pttSetting === 'AltRight'
    || pttSetting === 'ControlLeft'
    || pttSetting === 'ControlRight'
    || pttSetting === 'ShiftLeft'
    || pttSetting === 'ShiftRight'
}

const PROCESSING_TIMEOUT_BASE_MS = 15_000
const PROCESSING_TIMEOUT_PER_AUDIO_SEC_MS = 500
const PROCESSING_TIMEOUT_MAX_EXTRA_MS = 30_000

/** 根据音频时长和工作模式计算处理超时时间 */
export function computeProcessingTimeoutMs(
  audioDurationSec: number,
  providerMode: string,
): number {
  const safeAudioSec = Number.isFinite(audioDurationSec) ? Math.max(0, audioDurationSec) : 0
  const extraMs = Math.min(
    PROCESSING_TIMEOUT_MAX_EXTRA_MS,
    Math.ceil(safeAudioSec * PROCESSING_TIMEOUT_PER_AUDIO_SEC_MS),
  )
  let timeout = PROCESSING_TIMEOUT_BASE_MS + extraMs

  if (providerMode === 'local') {
    // local 模式多段并行推理，sherpa-onnx 推理时间随段数线性增长；
    // 旧值 30s 对 15s+ 录音太紧（首段启动 + N 段并发 + LLM 校对），导致 onFinal 漏字。
    // 提到 60s 起步 + 每秒 500ms 额外（与 cloud_api 对齐），上限 120s。
    const localMin = 60_000
    const localWithAudio = localMin + Math.ceil(safeAudioSec * 500)
    timeout = Math.min(Math.max(timeout, localWithAudio), 120_000)
  } else if (providerMode === 'cloud_api') {
    const cloudTimeout = 30000 + Math.ceil(safeAudioSec * 500)
    // 上限从 90000 → 180000，覆盖更长录音 + 远端 LLM 校对耗时
    timeout = Math.min(Math.max(timeout, cloudTimeout), 180_000)
  } else {
    // 未知 provider mode：兜底给 30s
    timeout = Math.max(timeout, 30_000)
  }
  return timeout
}

// ─────────────────────────────────────────────────────────────
// Recorder state machine

import type { RecorderState } from './types'

/** 合法状态转移表（from → to） */
export const VALID_TRANSITIONS: ReadonlyArray<readonly [RecorderState, RecorderState]> = [
  ['idle', 'recording'],
  ['recording', 'processing'],
  ['recording', 'idle'],
  ['processing', 'idle'],
] as const

/**
 * 判断 (from, to) 是否是合法状态转移
 *
 * 状态机只允许 4 种合法转换：
 * 1. idle → recording         （PTT 按下 / 开始录音）
 * 2. recording → processing   （PTT 释放 / 停止录音进入 ASR）
 * 3. recording → idle         （极短录音丢弃 / 主动取消）
 * 4. processing → idle        （final 到达 / 超时回 idle）
 *
 * 其他组合一律视为非法（如 idle → processing、recording → recording、idle → idle），
 * 调用方应记 warn 日志并忽略。
 */
export function isValidTransition(
  from: RecorderState,
  to: RecorderState,
): boolean {
  return VALID_TRANSITIONS.some(([f, t]) => f === from && t === to)
}
