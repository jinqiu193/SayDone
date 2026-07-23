/**
 * 浮窗可见性追踪器 — 在 showOverlay/hideOverlay 调用处更新，
 * OverlayService 在推送前查询 shouldEmit()。
 *
 * 目的：
 * - 浮窗隐藏时不再推送任何 overlay state（节省 IPC roundtrip + 防止 payload 堆积）
 * - 录音期间用户拖关闭浮窗 → ticker 静默；恢复浮窗时下一帧会重新推送
 *
 * 注意：Tauri 在 hidden 窗口上的 emit 仍然是静默 no-op，但每个 emit 仍会
 * 解码 + 入队 invoke 响应，并不完全免费。在长录音场景下值得跳过。
 */
let visible = false
const listeners = new Set<(v: boolean) => void>()

export function markOverlayVisible() {
  if (visible) return
  visible = true
  listeners.forEach((cb) => cb(true))
}

export function markOverlayHidden() {
  if (!visible) return
  visible = false
  listeners.forEach((cb) => cb(false))
}

export function isOverlayVisible(): boolean {
  return visible
}

export function onOverlayVisibilityChange(cb: (v: boolean) => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
