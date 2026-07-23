/**
 * 应用启动时自动检查、下载、安装更新
 * 在 App.tsx 中调用，不依赖任何页面挂载
 *
 * ⚠️ 必须保持 fire-and-forget 语义：所有异常都在内部吞掉，仅写 console。
 * 历史上此函数 fetch 失败曾阻塞主界面渲染（10s DNS 超时），造成"卡死"。
 */

import { checkVersionUpdate } from './updateChecker'
import { getSetting } from '@/services/store'
import * as bridge from '@/services/bridge'

/** 更新状态，供 UI 层订阅 */
export type AutoUpdatePhase = 'idle' | 'checking' | 'downloading' | 'installing'
export interface AutoUpdateState {
  phase: AutoUpdatePhase
  version?: string
}

let currentState: AutoUpdateState = { phase: 'idle' }
const listeners: Set<(state: AutoUpdateState) => void> = new Set()

function setState(state: AutoUpdateState) {
  currentState = state
  listeners.forEach((cb) => cb(state))
}

export function getAutoUpdateState() {
  return currentState
}

export function onAutoUpdateChange(cb: (state: AutoUpdateState) => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export async function runAutoUpdate() {
  try {
    await runAutoUpdateImpl()
  } catch (err) {
    // 兜底：绝不让此函数抛出或挂起主界面 mount 流程。
    // fetch/parse 任何阶段的异常都必须在这里吃掉，并回到 idle。
    console.warn('[runAutoUpdate] 静默失败：', err)
    setState({ phase: 'idle' })
  }
}

async function runAutoUpdateImpl() {
  const enabled = await getSetting('autoCheckUpdate', true)
  if (!enabled) return

  setState({ phase: 'checking' })

  const currentVersion = __APP_VERSION__
  const info = await checkVersionUpdate(currentVersion)

  if (!info?.hasUpdate || !info.downloadUrl) {
    if (info?.error) {
      console.warn('[runAutoUpdate] 检查更新返回错误：', info.error)
    }
    setState({ phase: 'idle' })
    return
  }

  setState({ phase: 'downloading', version: info.latestVersion || undefined })

  try {
    const filePath = await bridge.downloadUpdate(info.downloadUrl)

    // 通知用户即将安装，给 3 秒缓冲
    setState({ phase: 'installing', version: info.latestVersion || undefined })
    await new Promise((r) => setTimeout(r, 3000))

    await bridge.installDownloadedUpdate(filePath)
  } catch (err) {
    console.warn('[runAutoUpdate] 下载/安装失败：', err)
    setState({ phase: 'idle' })
  }
}
