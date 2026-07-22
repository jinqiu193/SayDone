// 前端版本检查 — 直接请求后端 manifest API 比较版本号

import { getBackendBaseUrl } from '@/services/runtimeConfig'

export interface VersionInfo {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string | null
  downloadUrl: string | null
  releaseDate: string | null
  error: string | null
}

function compareVersions(current: string, latest: string): number {
  const a = current.split('.').map(Number)
  const b = latest.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (b[i] || 0) - (a[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

export async function checkVersionUpdate(currentVersion: string): Promise<VersionInfo> {
  const base: VersionInfo = {
    hasUpdate: false,
    currentVersion,
    latestVersion: null,
    downloadUrl: null,
    releaseDate: null,
    error: null,
  }

  let baseUrl: string
  try {
    baseUrl = getBackendBaseUrl()
  } catch (err) {
    base.error = `无法获取后端地址: ${err}`
    return base
  }

  // 用户场景：DNS 失败 / 离线 / 服务器 5xx 都会走 catch。
  // 此函数被 runAutoUpdate 调用，必须静默返回，绝不抛出。
  try {
    const resp = await fetch(`${baseUrl}/api/desktop-updates/win32/x64/manifest`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    })
    if (!resp.ok) {
      base.error = resp.status === 404 ? null : `HTTP ${resp.status}`
      return base
    }
    const manifest = await resp.json() as {
      version?: string
      releaseDate?: string
      download_path?: string
    }
    const latestVersion = manifest.version
    if (!latestVersion) return base

    base.latestVersion = latestVersion
    base.releaseDate = manifest.releaseDate || null
    base.downloadUrl = manifest.download_path
      ? `${baseUrl}${manifest.download_path}`
      : null
    base.hasUpdate = compareVersions(currentVersion, latestVersion) > 0
    return base
  } catch (err) {
    // 网络错误（DNS / 超时 / CORS）—— 留个轻量日志便于排查，但不阻塞 UI。
    console.warn('[checkVersionUpdate] 网络错误，使用默认占位结果：', String(err))
    base.error = String(err)
    return base
  }
}
