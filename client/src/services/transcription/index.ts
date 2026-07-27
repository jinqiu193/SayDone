// Provider 管理器 — 根据 workMode 返回对应的 TranscriptionProvider

import { getSetting } from '../store'
import { addRuntimeEvent } from '../debugLog'
import { CloudAPIProvider } from './CloudAPIProvider'
import { LocalProvider } from './LocalProvider'
import type { TranscriptionProvider, WorkMode } from './types'

export type { TranscriptionProvider, TranscriptionCallbacks, StartOptions, StopOptions, FinalResult, ASRResult, WorkMode, ProviderState } from './types'

let currentProvider: TranscriptionProvider | null = null
let currentMode: WorkMode = 'cloud_api'

// ── workMode 变化订阅器 ──
// 让 UI（Sidebar 等）能在 init 完成后自动响应 workMode 变化，避免在 render-time
// 同步读取 getWorkMode() 后无法感知异步初始化的状态变更。
type WorkModeListener = (mode: WorkMode) => void
const workModeListeners = new Set<WorkModeListener>()

function emitWorkModeChange(mode: WorkMode) {
  workModeListeners.forEach((l) => {
    try {
      l(mode)
    } catch {
      // ignore listener errors
    }
  })
}

/** 订阅 workMode 变化。返回取消订阅的函数。 */
export function subscribeWorkMode(listener: WorkModeListener): () => void {
  workModeListeners.add(listener)
  return () => {
    workModeListeners.delete(listener)
  }
}

function createProvider(mode: WorkMode): TranscriptionProvider {
  switch (mode) {
    case 'cloud_api':
      return new CloudAPIProvider()
    case 'local':
      return new LocalProvider()
    default:
      addRuntimeEvent('warn', 'transcription', `未知工作模式 "${mode}"，回退到云 API 模式`)
      return new CloudAPIProvider()
  }
}

/** 获取当前 Provider 实例（懒初始化） */
export function getProvider(): TranscriptionProvider {
  if (!currentProvider) {
    currentProvider = createProvider(currentMode)
  }
  return currentProvider
}

/** 获取当前工作模式 */
export function getWorkMode(): WorkMode {
  return currentMode
}

/**
 * 切换工作模式。
 * 会断开旧 Provider 并创建新的。
 * 调用方需要重新 connect。
 */
export async function switchProvider(mode: WorkMode): Promise<TranscriptionProvider> {
  if (mode === currentMode && currentProvider) {
    return currentProvider
  }

  addRuntimeEvent('info', 'transcription', '切换工作模式', { from: currentMode, to: mode })

  // 断开旧 Provider
  if (currentProvider) {
    try {
      currentProvider.disconnect()
    } catch {
      // ignore
    }
  }

  currentMode = mode
  currentProvider = createProvider(mode)
  emitWorkModeChange(currentMode)
  return currentProvider
}

/** 从 store 读取保存的 workMode 并初始化 */
export async function initProviderFromStore(): Promise<void> {
  const stored = await getSetting('workMode', 'cloud_api')
  // 兼容旧版本：已移除的 'server' 模式自动迁移到 'cloud_api'
  let mode: WorkMode
  if (stored === 'cloud_api' || stored === 'local') {
    mode = stored
  } else {
    if (stored === 'server') {
      addRuntimeEvent('info', 'transcription', '检测到旧版本的服务器模式，自动迁移到云 API 模式')
      await import('../store').then(({ setSetting }) => setSetting('workMode', 'cloud_api'))
    }
    mode = 'cloud_api'
  }
  currentMode = mode
  currentProvider = createProvider(currentMode)
  emitWorkModeChange(currentMode)
  addRuntimeEvent('info', 'transcription', 'Provider 已初始化', { mode: currentMode })
}
