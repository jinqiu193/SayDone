import { startWebviewKeyboardFallback } from './services/webviewKeyboardFallback'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { addRuntimeEvent } from './services/debugLog'
import { initRuntimeConfig } from './services/runtimeConfig'
import { initProviderFromStore } from './services/transcription'

window.addEventListener('error', (event) => {
  addRuntimeEvent('error', 'window', event.message || 'Uncaught error', {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  })
})

window.addEventListener('unhandledrejection', (event) => {
  addRuntimeEvent('error', 'promise', 'Unhandled promise rejection', {
    reason: String(event.reason),
  })
})

// ── 关键：先 render 主窗口，再 fire-and-forget 异步 init ──
// 之前 await initRuntimeConfig + initProviderFromStore 才 render，主窗口要等几百 ms 才出。
// 改成 render-first：所有 init 函数都有同步安全默认值（backendBaseUrl 用 builtin / workMode='server'），
// 即使 init 还没完成，UI 也能正常显示；init 完成后由订阅者（Sidebar 等）自动更新。
ReactDOM.createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <App />
  </HashRouter>,
)

void (async () => {
  try {
    await initRuntimeConfig()
  } catch (e) {
    addRuntimeEvent('warn', 'bootstrap', 'initRuntimeConfig failed', { error: String(e) })
  }
  try {
    await initProviderFromStore()
  } catch (e) {
    addRuntimeEvent('warn', 'bootstrap', 'initProviderFromStore failed', { error: String(e) })
  }
  try {
    await startWebviewKeyboardFallback()
  } catch (e) {
    addRuntimeEvent('warn', 'bootstrap', 'startWebviewKeyboardFallback failed', { error: String(e) })
  }
})()
