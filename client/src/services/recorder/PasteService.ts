import * as bridge from '../bridge'
import type { TextInsertionAttempt, TextInsertionResult } from '../textInsertion'

export interface ProbeResult {
  editable: boolean
  hwnd: string
  process: string
  detail: string
  pid?: number
  tid?: number
  focusHwnd?: string
  caretHwnd?: string
  caret?: number
  hasCaret?: boolean
  control?: number
  verdict?: string
  probeId?: number
  startedAt?: number
  completedAt?: number
  isCurrentAppProcess?: boolean
  windowClass?: string
  focusClass?: string
  controlType?: string
  automationId?: string
  isValuePatternAvailable?: boolean
  isKeyboardFocusable?: boolean
  isEnabled?: boolean
  isReadOnly?: boolean
}

export interface PasteResult extends TextInsertionResult {
  attempts?: TextInsertionAttempt[]
}

export class PasteService {
  /**
   * Get the pre-probed editable result (probed at PTT down in main process).
   */
  async getProbeResult(): Promise<ProbeResult> {
    try {
      const result = await bridge.getProbeResult()
      if (!result) return { editable: false, hwnd: '0', process: '-', detail: 'no_api' }
      return result as unknown as ProbeResult
    } catch {
      return { editable: false, hwnd: '0', process: '-', detail: 'probe_error' }
    }
  }

  /**
   * 检查缓存的 probe hwnd 对应的窗口/进程是否仍存活。
   * 用于本地 ASR（10-30s 长耗时）场景：录音期间前台窗口可能被通知/AI 面板劫持，
   * cached probe 过期时不要重新 probe（会读到错的窗口），先确认原窗口还活着。
   */
  async isHwndAlive(hwnd: string): Promise<boolean> {
    try {
      return await bridge.isHwndAlive(hwnd)
    } catch {
      return false
    }
  }

  /**
   * Paste text using pre-probed hwnd/focusHwnd.
   * Passing the hwnd avoids re-capturing context after PTT release
   * (which may return the wrong foreground window).
   *
   * `selectionOptions`：选区操作模式
   *   - selectionHwnd: 原选区所在的 hwnd（用于重新选中）
   *   - selectionLength: 原选区字符数（往前数 N 字符定位）
   * 传入时 Rust 会走"先重新选中、再注入"的策略；不传则走普通注入。
   */
  async pasteText(
    text: string,
    probe?: ProbeResult,
    selectionOptions?: { selectionHwnd?: string; selectionLength?: number },
  ): Promise<PasteResult> {
    try {
      bridge.hideOverlay()
      const result = await bridge.pasteText(
        text,
        probe?.hwnd,
        probe?.focusHwnd,
        {
          selectionHwnd: selectionOptions?.selectionHwnd,
          selectionLength: selectionOptions?.selectionLength,
        },
      )
      if (!result) return { ok: false, reason: 'no_result' }
      return result as PasteResult
    } catch (error) {
      return {
        ok: false,
        reason: 'paste_exception',
        detail: String(error),
      }
    }
  }
}
