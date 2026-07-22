// TextInserter — 文本注入：probe 校验 → paste → 兜底卡片
//
// 职责：
// 1. 取 cached probe result（PTT-down 时缓存），过期校验原 hwnd 存活
// 2. probe 不可编辑 → 复制 + fallback 卡片
// 3. probe 可编辑 → waitForModifierPTTRelease → pasteText
// 4. paste 失败 → 复制 + fallback 卡片
//
// 不负责：AI chat 结果生成、ASR final 处理、状态机切换。

import { addRuntimeEvent } from '../debugLog'
import type { OverlayService } from './OverlayService'
import type { PasteService } from './PasteService'
import type { RecorderContext } from './types'
import { PROBE_TTL_MS } from './types'

export interface TextInserterDeps {
  /** 等修饰键 PTT 释放稳定后再注入 — RecorderOrchestrator 持有 lastPTTUpAt 状态 */
  waitForModifierPTTReleaseIfNeeded: () => Promise<void>
  /** 顶层 resetToIdle（兜底卡片触发时调用，keepOverlay=true） */
  resetToIdleFn: (opts?: { keepOverlay?: boolean }) => void
}

export class TextInserter {
  constructor(
    private ctx: RecorderContext,
    private pasteService: PasteService,
    private overlayService: OverlayService,
    private deps: TextInserterDeps,
  ) {}

  /** 文本注入主入口：probe → paste → fallback。
   *  返回 void；副作用全部走 addRuntimeEvent + overlay。
   *
   *  - options.allowWhenIdle=true 时允许在 state !== 'processing' 也注入（late final 兜底） */
  async handleTextInsertion(text: string, options?: { allowWhenIdle?: boolean }): Promise<void> {
    const insertionStartedAt = Date.now()
    const allowWhenIdle = options?.allowWhenIdle === true

    if (this.ctx.state !== 'processing' && !allowWhenIdle) {
      addRuntimeEvent('warn', 'recorder', 'handleTextInsertion 跳过：状态已不是 processing', { state: this.ctx.state })
      return
    }

    // 取 cached probe；过期则校验原 hwnd 存活，否则重新探测
    const probe = await this.resolveProbe()
    if (!probe) return

    addRuntimeEvent('info', 'recorder', '粘贴决策', {
      probeId: probe.probeId,
      editable: probe.editable,
      hwnd: probe.hwnd,
      focusHwnd: probe.focusHwnd,
      pid: probe.pid,
      process: probe.process,
      verdict: probe.verdict,
      isCurrentAppProcess: probe.isCurrentAppProcess,
      windowClass: probe.windowClass,
      focusClass: probe.focusClass,
      finalToDecisionMs: this.ctx.finalReceivedAt > 0 ? insertionStartedAt - this.ctx.finalReceivedAt : undefined,
      detail: probe.detail,
      textLen: text.length,
    })

    if (!probe.editable) {
      addRuntimeEvent('info', 'recorder', '目标不可编辑，进入兜底流程并复制到剪贴板', {
        probeId: probe.probeId,
        pid: probe.pid,
        process: probe.process,
        verdict: probe.verdict,
        isCurrentAppProcess: probe.isCurrentAppProcess,
        detail: probe.detail,
      })
      await this.copyTextSafely(text, 'not_editable')
      addRuntimeEvent('info', 'recorder', '目标不是当前 SayDone 进程，准备展示兜底卡片', {
        probeId: probe.probeId,
        pid: probe.pid,
        process: probe.process,
      })
      this.showFallbackAndReset(text, 'not_editable')
      return
    }

    await this.deps.waitForModifierPTTReleaseIfNeeded()

    // 选区操作模式：把原选区重新选中，再用 AI 输出覆盖（实现"替换"）
    const selectionOptions = this.ctx.capturedSelection && this.ctx.capturedSelection.length > 0
      ? { selectionHwnd: this.ctx.capturedSelection.hwnd, selectionLength: this.ctx.capturedSelection.length }
      : undefined

    const pasteStartedAt = Date.now()
    const result = await this.pasteService.pasteText(text, probe, selectionOptions)
    if (result.ok) {
      addRuntimeEvent('info', 'recorder', '外部文本注入成功', {
        strategy: result.strategy,
        detail: result.detail,
        attempts: result.attempts,
        finalToPasteDoneMs: this.ctx.finalReceivedAt > 0 ? Date.now() - this.ctx.finalReceivedAt : undefined,
        pasteExecMs: Date.now() - pasteStartedAt,
      })
      if (this.ctx.state === 'processing') {
        this.deps.resetToIdleFn?.()
      }
      return
    }

    const level = result.reason === 'paste_exception' ? 'error' : 'warn'
    addRuntimeEvent(level, 'recorder', '外部文本注入失败，展示兜底卡片', {
      strategy: result.strategy,
      reason: result.reason,
      detail: result.detail,
      attempts: result.attempts,
      finalToPasteDoneMs: this.ctx.finalReceivedAt > 0 ? Date.now() - this.ctx.finalReceivedAt : undefined,
      pasteExecMs: Date.now() - pasteStartedAt,
    })
    await this.copyTextSafely(text, result.reason || 'paste_failed')
    this.showFallbackAndReset(text, result.reason || 'paste_failed')
  }

  /** 取 cached probe，过期则校验原 hwnd 存活，否则重新探测 */
  private async resolveProbe() {
    let probe = this.ctx.cachedProbeResult
    let usedCachedProbe = probe !== null
    if (probe && typeof probe.completedAt === 'number') {
      const ageMs = Date.now() - probe.completedAt
      if (ageMs > PROBE_TTL_MS) {
        addRuntimeEvent('info', 'recorder', 'probe 已过期，校验原窗口是否仍存活', {
          ageMs,
          oldHwnd: probe.hwnd,
          oldProcess: probe.process,
        })
        const stillAlive = await this.pasteService.isHwndAlive(probe.hwnd)
        if (!stillAlive) {
          addRuntimeEvent('warn', 'recorder', '原窗口已关闭，重新探测前台窗口', {
            oldHwnd: probe.hwnd,
          })
          try {
            probe = await this.pasteService.getProbeResult()
            usedCachedProbe = false
          } catch {
            // fall back to stale probe
          }
        } else {
          addRuntimeEvent('info', 'recorder', '原窗口仍存活，继续使用 cached probe', {
            hwnd: probe.hwnd,
          })
        }
      }
    } else if (!probe) {
      probe = await this.pasteService.getProbeResult()
      usedCachedProbe = false
    }
    // 标记 usedCachedProbe 便于上层日志（当前用不到，但保留可观测性）
    void usedCachedProbe
    return probe
  }

  private async copyTextSafely(text: string, reason: string): Promise<void> {
    const { copyText } = await import('../bridge')
    try {
      await copyText(text)
      addRuntimeEvent('info', 'recorder', '已复制文本到剪贴板', { reason, textLen: text.length })
    } catch (error) {
      addRuntimeEvent('warn', 'recorder', '复制兜底文本到剪贴板失败', {
        reason,
        error: String(error),
      })
    }
  }

  /** 兜底卡片 + reset（通过 deps 回调顶层 resetToIdle）。 */
  private showFallbackAndReset(text: string, reason: string): void {
    addRuntimeEvent('info', 'recorder', '展示兜底卡片', {
      reason,
      textLen: text.length,
      stateBeforeReset: this.ctx.state,
    })
    this.overlayService.showFallback(text, reason)
    if (this.ctx.state === 'processing') {
      this.deps.resetToIdleFn?.({ keepOverlay: true })
    }
  }
}