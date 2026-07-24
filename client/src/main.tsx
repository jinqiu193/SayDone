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
})()

void (async () => {
  await new Promise(resolve => setTimeout(resolve, 500))
  try {
    await initProviderFromStore()
  } catch (e) {
    addRuntimeEvent('warn', 'bootstrap', 'initProviderFromStore failed', { error: String(e) })
  }
})()

void (async () => {
  await new Promise(resolve => setTimeout(resolve, 1000))
  try {
    await startWebviewKeyboardFallback()
  } catch (e) {
    addRuntimeEvent('warn', 'bootstrap', 'startWebviewKeyboardFallback failed', { error: String(e) })
  }
})()
