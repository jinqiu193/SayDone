import { RecorderOrchestrator } from './recorder/RecorderOrchestrator'
import type { RecorderState } from './recorder/types'
import { onMousePTTChanged, onScrollUpChanged, onScrollDownChanged } from './bridge'

let orchestrator = new RecorderOrchestrator()

// 托盘菜单鼠标设置开关
onMousePTTChanged(({ enabled }) => {
  orchestrator.updateMouseSettings('mouse_ptt', enabled)
})
onScrollUpChanged(({ enabled }) => {
  orchestrator.updateMouseSettings('scroll_up', enabled)
})
onScrollDownChanged(({ enabled }) => {
  orchestrator.updateMouseSettings('scroll_down', enabled)
})

// HMR cleanup: dispose old orchestrator when module is hot-replaced
if ((import.meta as unknown as Record<string, unknown>).hot) {
  const hot = (import.meta as unknown as Record<string, unknown>).hot as { dispose: (cb: () => void) => void }
  hot.dispose(() => {
    console.log('[recorder] HMR dispose: cleaning up old orchestrator')
    orchestrator.cleanup()
  })
}

export function setStateListener(cb: (s: RecorderState) => void) {
  orchestrator.setStateListener(cb)
}

export function getState() {
  return orchestrator.getState()
}

export async function initRecorder() {
  await orchestrator.init()
}

export function cleanup() {
  orchestrator.cleanup()
}

/** Call after changing settings that recorder caches (preset, mic, overlay display) */
export async function refreshRecorderSettings() {
  await orchestrator.refreshRuntimeSettings()
}

/** 仅刷新 overlay 显示设置（主题/长度/时长）— 轻量，避免触发全量录音缓存刷新 */
export async function refreshOverlaySettings() {
  await orchestrator.refreshOverlaySettings()
}

/** 工作模式切换后重新连接 */
export function reconnectProvider() {
  orchestrator.reconnectProvider()
}

/** Backward-compatible alias */
export async function refreshPreset() {
  await orchestrator.refreshRuntimeSettings()
}

/** 临时禁用/启用 PTT（用于欢迎向导热键确认步骤） */
export function setPttSuppressed(suppressed: boolean) {
  orchestrator.setPttSuppressed(suppressed)
}

/** 触发一次 hands-free 切换（与按免提快捷键等效） */
export function toggleHandsFree() {
  orchestrator.toggleHandsFree()
}

