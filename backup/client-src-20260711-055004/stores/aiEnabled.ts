// AI 整理开关的全局状态 store
// 让标题栏与 AI 整理设置页共享同一状态，任一处切换都会同步
// 采用 useSyncExternalStore 模式（与 connectionStatus 一致，无外部依赖）

import { getSetting, setSetting } from '@/services/store'
import { refreshRecorderSettings } from '@/services/recorder'

type Listener = () => void

let currentValue = false
let initialized = false
const listeners = new Set<Listener>()

function emitChange() {
  for (const listener of listeners) listener()
}

/** 从持久化设置读取初始值（仅首次生效），供应用启动时调用 */
export async function initAiEnabled(): Promise<void> {
  if (initialized) return
  initialized = true
  const stored = await getSetting('aiEnabled', false)
  const next = Boolean(stored)
  if (next !== currentValue) {
    currentValue = next
    emitChange()
  }
}

export function getAiEnabled(): boolean {
  return currentValue
}

export function subscribeAiEnabled(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 设置开关状态：更新内存状态 + 通知订阅者 + 持久化 + 刷新录音器缓存 */
export async function setAiEnabled(next: boolean): Promise<void> {
  if (next !== currentValue) {
    currentValue = next
    emitChange()
  }
  await setSetting('aiEnabled', next)
  await refreshRecorderSettings()
}

/** 切换开关状态 */
export async function toggleAiEnabled(): Promise<void> {
  await setAiEnabled(!currentValue)
}
