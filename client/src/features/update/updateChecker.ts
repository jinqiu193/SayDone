// 前端版本检查 — 从 GitHub Releases API 获取最新版本

const GITHUB_REPO = 'crosswk/YCRW'
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

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

function getInstallerUrl(assets: Array<{ name: string; browser_download_url: string }> | undefined): string | null {
  if (!assets || assets.length === 0) return null
  const installer = assets.find((a) => a.name.endsWith('-setup.exe'))
    || assets.find((a) => a.name.endsWith('.msi'))
    || assets[0]
  return installer?.browser_download_url || null
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

  try {
    const resp = await fetch(GITHUB_API_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!resp.ok) {
      if (resp.status === 404) {
        base.error = '未找到 releases'
      } else {
        base.error = `HTTP ${resp.status}`
      }
      return base
    }
    const release = await resp.json() as {
      tag_name?: string
      published_at?: string
      assets?: Array<{ name: string; browser_download_url: string }>
    }
    let latestVersion = release.tag_name
    if (!latestVersion) return base
    if (latestVersion.startsWith('v')) {
      latestVersion = latestVersion.slice(1)
    }

    base.latestVersion = latestVersion
    base.releaseDate = release.published_at || null
    base.downloadUrl = getInstallerUrl(release.assets)
    base.hasUpdate = compareVersions(currentVersion, latestVersion) > 0
    return base
  } catch (err) {
    console.warn('[checkVersionUpdate] 网络错误：', String(err))
    base.error = String(err)
    return base
  }
}
