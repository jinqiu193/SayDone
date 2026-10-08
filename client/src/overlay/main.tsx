import { startWebviewKeyboardFallback } from '../services/webviewKeyboardFallback'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import Overlay, { invalidateOverlayAccentCache } from './Overlay'
import { applyTheme } from '../themes'
import * as bridge from '../services/bridge'
import { ErrorBoundary } from '../components/ErrorBoundary'
import '../index.css'

// Transparent background for overlay window
const style = document.createElement('style')
style.textContent = 'html, body, #root { background: transparent !important; }'
document.head.appendChild(style)

void startWebviewKeyboardFallback()

// Health check: respond to ping from main process so it can detect
// WebView2 unresponsiveness. Bug 003 diagnostic.
void listen<number>('overlay-ping', (event) => {
  const seq = typeof event.payload === 'number' ? event.payload : 0
  void invoke('overlay_pong', { seq }).catch(() => {})
})

// 浮窗独立 WebViewWindow，需要自己注入主题 CSS 变量。
// 启动时从持久化存储读取主题设置；之后订阅 theme-changed 事件实时跟随。
const THEME_SETTING_KEY = 'theme'
const DEFAULT_THEME = 'qing-ci'

async function initOverlayTheme() {
  try {
    const savedTheme = await bridge.storeGet(THEME_SETTING_KEY)
    const themeId = typeof savedTheme === 'string' ? savedTheme : DEFAULT_THEME
    applyTheme(themeId)
    invalidateOverlayAccentCache()
  } catch (error) {
    console.warn('[overlay] Failed to load theme from store, using default:', error)
    applyTheme(DEFAULT_THEME)
    invalidateOverlayAccentCache()
  }
}

void initOverlayTheme()

bridge.onThemeChanged((themeId) => {
  applyTheme(themeId)
  invalidateOverlayAccentCache()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary name="Overlay" onError={() => bridge.hideOverlay()}>
      <Overlay />
    </ErrorBoundary>
  </React.StrictMode>
)