/**
 * Tauri IPC Bridge — 所有前端代码通过这个模块与 Rust 后端通信。
 */

import { invoke } from '@tauri-apps/api/core'
import { listen, emit } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

import type { UpdateStatus } from '../types/update'
import type { DiagnosticOccurrence, DiagnosticsPreview } from '../types/appApi'
import * as overlayVisibility from './recorder/overlayVisibility'

// Re-export for convenience
export { invoke, listen, emit }

// ─── Window Controls ───

export function minimize() {
  getCurrentWindow().minimize()
}

export function maximize() {
  getCurrentWindow().toggleMaximize()
}

export function close() {
  getCurrentWindow().close()
}

// ─── Overlay ───

/**
 * Bug 003 diagnostic helper — log overlay IPC failures to runtime events
 * (which mirror to saydone.log via appendDebugLog).
 */
function logOverlayIpcError(op: string, err: unknown) {
  try {
    // Lazy import to avoid circular dep with debugLog
    void import('./debugLog').then(({ addRuntimeEvent }) => {
      addRuntimeEvent('error', 'overlay-ipc', `${op} failed`, { error: String(err) })
    })
  } catch {
    console.error(`[overlay-ipc] ${op} failed:`, err)
  }
}

export function showOverlay() {
  // 立刻标记可见（不等 IPC 返回，避免 ticker 错过下一帧）
  overlayVisibility.markOverlayVisible()
  invoke('show_overlay').catch((err) => {
    overlayVisibility.markOverlayHidden()
    logOverlayIpcError('show_overlay', err)
  })
}

export function hideOverlay() {
  overlayVisibility.markOverlayHidden()
  invoke('hide_overlay').catch((err) => logOverlayIpcError('hide_overlay', err))
}

export function updateOverlay(data: unknown) {
  invoke('update_overlay_state', { data }).catch((err) => logOverlayIpcError('update_overlay_state', err))
}

// ─── Paste / Context ───

export function pasteText(text: string, hwnd?: string, focusHwnd?: string, options?: { selectionHwnd?: string; selectionLength?: number }) {
  return invoke<{
    ok: boolean
    strategy?: string
    reason?: string
    detail?: string
    attempts?: Array<{ strategy: string; ok: boolean; reason?: string; detail?: string }>
  }>('paste_text', {
    text,
    hwnd: hwnd || null,
    focusHwnd: focusHwnd || null,
    selectionHwnd: options?.selectionHwnd || null,
    selectionLength: options?.selectionLength ?? null,
  })
}

export function getProbeResult() {
  return invoke<Record<string, unknown>>('get_probe_result')
}

/**
 * 检查指定 hwnd 对应的窗口是否仍存活（用于处理本地 ASR 长耗时场景下的 probe 过期）。
 * 传入由 getProbeResult 拿到的 hwnd 字符串（十进制）。
 * Returns true 表示窗口仍存活（同一进程未退出）；false 表示已关闭或不可访问。
 */
export function isHwndAlive(hwnd: string): Promise<boolean> {
  return invoke<boolean>('is_hwnd_alive', { hwnd })
}

export function getActiveAppContext() {
  return invoke<Record<string, unknown> | null>('get_active_app_context')
}

export function getClientRuntimeInfo() {
  return invoke<{
    userId: string
    userName: string
    deviceId: string
    hostname: string
    clientVersion: string
    platform: string
    osVersion: string
    localIp: string
    systemLocale: string
    cpuCores: number
    memoryMb: number
  }>('get_client_runtime_info')
}

export function copyText(text: string) {
  return invoke('copy_text', { text })
}

export function appendDebugLog(payload: unknown) {
  invoke('append_debug_log', { payload })
}

// ─── Store ───

export function storeGet(key: string) {
  return invoke<unknown>('store_get', { key })
}

export function storeSet(key: string, value: unknown) {
  return invoke('store_set', { key, value })
}

export function storeDelete(key: string) {
  return invoke('store_delete', { key })
}

// ─── History ───

export function historyList(query?: {
  keyword?: string
  favoriteOnly?: boolean
  limit?: number
  offset?: number
}) {
  return invoke<unknown[]>('history_list', { query })
}

export function historyCount(query?: {
  keyword?: string
  favoriteOnly?: boolean
}) {
  return invoke<number>('history_count', { query })
}

export function historyAdd(record: unknown) {
  return invoke('history_add', { record })
}

// ─── Meeting (会议纪要) ───

export interface MeetingSummarizeResult {
  text: string
  elapsed_ms: number
}

export function summarizeMeeting(text: string, aiConfig: {
  provider: string
  api_url: string
  api_key: string
  model: string
}) {
  return invoke<MeetingSummarizeResult>('summarize_meeting', {
    request: { text, ai_config: aiConfig },
  })
}

// ─── AI 生成热词（onboarding 用） ────────────────────────────────────────────

export interface AiHotwordsResult {
  words: string[]
  raw_text: string
  elapsed_ms: number
  /** "llm" = 来自 LLM 实时生成；"fallback" = 来自本地预置词集 */
  source: string
}

export function aiGenerateHotwords(payload: {
  roles: string[]
  scenarios: string[]
  extraContext?: string
  aiConfig: {
    provider: string
    api_url: string
    api_key: string
    model: string
  }
}): Promise<AiHotwordsResult> {
  return invoke<AiHotwordsResult>('ai_generate_hotwords', {
    request: {
      roles: payload.roles,
      scenarios: payload.scenarios,
      extra_context: payload.extraContext ?? null,
      ai_config: payload.aiConfig,
    },
  })
}


export function historyUpdate(id: string, patch: Record<string, unknown>) {
  return invoke('history_update', { id, patch })
}

export function historyDelete(id: string) {
  return invoke('history_delete', { id })
}

export function historySetFavorite(id: string, favorite: boolean) {
  return invoke('history_set_favorite', { id, favorite })
}

// ─── Export ───

export function saveTextExport(payload: {
  defaultPath: string
  content: string
  filters?: Array<{ name: string; extensions: string[] }>
}) {
  return invoke<string | null>('save_text_export', { payload })
}

export function saveExportBundle(payload: {
  defaultPath: string
  files: Array<{ name: string; content: string }>
}) {
  return invoke<string | null>('save_export_bundle', { payload })
}

// ─── Shortcuts ───

export function notifyShortcutsChanged() {
  invoke('shortcuts_changed')
}

export function testShortcut(accelerator: string) {
  return invoke<boolean>('test_shortcut', { accelerator })
}

// ─── Theme ───

/**
 * 主窗口切换主题时调用，向所有 webview（包括浮窗）广播 theme-changed 事件。
 * 浮窗 main.tsx 订阅此事件并在自己的 document 上 applyTheme。
 */
export async function notifyThemeChanged(themeId: string): Promise<void> {
  await emit('theme-changed', themeId)
}

/** 浮窗订阅主窗口的主题切换事件 */
export function onThemeChanged(handler: (themeId: string) => void): () => void {
  let unlisten: (() => void) | null = null
  void listen<string>('theme-changed', (event) => {
    const id = typeof event.payload === 'string' ? event.payload : ''
    if (id) handler(id)
  }).then((fn) => {
    unlisten = fn
  })
  return () => {
    if (unlisten) unlisten()
  }
}

// ─── System ───

export function getAutoLaunch() {
  return invoke<boolean>('get_auto_launch')
}

export function setAutoLaunch(enable: boolean) {
  return invoke('set_auto_launch', { enable })
}

export function getUpdateStatus() {
  return invoke<UpdateStatus>('get_update_status')
}

export function checkForUpdates() {
  return invoke<UpdateStatus>('check_for_updates')
}

export function installDownloadedUpdate(filePath: string) {
  return invoke('install_downloaded_update', { filePath })
}

export function downloadUpdate(url: string) {
  return invoke<string>('download_update', { url })
}

export function restartApp() {
  return invoke('restart_app')
}

export function setPTTLabConfig(data: unknown) {
  console.log('[bridge] setPTTLabConfig called', data)
  invoke('set_ptt_lab_config', { data }).catch((err) => {
    console.error('[bridge] setPTTLabConfig failed:', err)
  })
}

export function aiChat(payload: {
  text: string
  aiConfig: Record<string, unknown>
  systemPrompt?: string  // 来自前端 preset 的 system_prompt；为 None/空时 Rust 用内置默认
  mode?: 'proofread' | 'chat'  // 决定 Rust 端 WrapMode（proofread=校对，chat=自由回答）
  selectedText?: string  // 选区操作模式：非空时走"双信封"路径，按用户语音指令处理选区
}) {
  // 注意：项目约定（参考 cloud_polish）—— struct 形式的 Tauri command 必须包在 'request' 字段里
  // struct 内字段名与 Rust 端 Serialize 一致（snake_case）
  return invoke<{ text: string; elapsed_ms: number }>('ai_chat', {
    request: {
      text: payload.text,
      ai_config: payload.aiConfig,
      system_prompt: payload.systemPrompt,
      mode: payload.mode,
      selected_text: payload.selectedText ?? null,
    },
  })
}

/** 选区捕获：通过 UIA TextPattern 读取当前焦点应用中的选中文本。
 *  不污染剪贴板、不会发送 Ctrl+C。 */
export function captureSelection() {
  return invoke<{
    text: string
    hwnd: string
    controlType: string
    automationId: string
    length: number
    available: boolean
  }>('capture_selection')
}

// ─── Audio Files ───

export function saveAudioFile(id: string, wavBase64: string) {
  return invoke<string>('save_audio_file', { id, wavBase64 })
}

export function savePcmAsWav(id: string, pcmBase64: string, sampleRate?: number) {
  return invoke<string>('save_pcm_as_wav', { id, pcmBase64, sampleRate: sampleRate ?? null })
}

/** P2-5: 增量追加 PCM 到 WAV — 按时间分片写入，避免内存堆积 */
export function appendPcmToWav(id: string, pcmBase64: string, sampleRate: number, isFirstChunk: boolean) {
  return invoke<string>('append_pcm_to_wav', { id, pcmBase64, sampleRate, isFirstChunk })
}

/** P2-5: 录音结束时修补 RIFF/data chunk size 字段 */
export function finalizeWavFile(id: string, totalPcmBytes: number) {
  return invoke<string>('finalize_wav_file', { id, totalPcmBytes })
}

/** P2-5: 清理未 finalize 的临时 WAV（异常退出场景） */
export function cleanupIncompleteWav(id: string) {
  return invoke('cleanup_incomplete_wav', { id })
}

// ─── Audio file I/O (incremental recording) ───

export function readAudioFile(filePath: string) {
  return invoke<string | null>('read_audio_file', { filePath })
}

export function deleteAudioFile(filePath: string) {
  return invoke('delete_audio_file', { filePath })
}

// ─── Diagnostics ───

export function collectSettings() {
  return invoke<Record<string, unknown>>('collect_settings')
}

export function getDiagnosticsPreview(data: {
  settings: Record<string, unknown>
  issueOccurrence: DiagnosticOccurrence
}) {
  return invoke<DiagnosticsPreview>('get_diagnostics_preview', { data })
}

export function createDiagnosticsZip(data: unknown) {
  return invoke<string>('create_diagnostics_zip', { data })
}

export function readDiagnosticsZip(path: string) {
  return invoke<number[] | null>('read_diagnostics_zip', { path })
}

export function copyDiagnosticsZip(source: string, destination: string) {
  return invoke<void>('copy_diagnostics_zip', { source, destination })
}

export function readLogFile(logType: string) {
  return invoke<string | null>('read_log_file', { logType })
}

export function openLogFolder() {
  return invoke('open_log_folder')
}

// ─── Event Listeners ───

export function onOverlayState(cb: (data: unknown) => void) {
  const unlisten = listen<unknown>('overlay-state', (event) => cb(event.payload))
  return () => { unlisten.then((fn) => fn()) }
}

export function onActiveAppContext(cb: (data: unknown) => void) {
  const unlisten = listen<unknown>('active-app-context', (event) => cb(event.payload))
  return () => { unlisten.then((fn) => fn()) }
}

export function onPTTDown(cb: (data?: unknown) => void) {
  const unlisten = listen<unknown>('ptt-down', (event) => cb(event.payload))
  return () => { unlisten.then((fn) => fn()) }
}

export function onPTTUp(cb: (data?: unknown) => void) {
  const unlisten = listen<unknown>('ptt-up', (event) => cb(event.payload))
  return () => { unlisten.then((fn) => fn()) }
}

export function onPTTToggle(cb: (data?: unknown) => void) {
  const unlisten = listen<unknown>('ptt-toggle', (event) => cb(event.payload))
  return () => { unlisten.then((fn) => fn()) }
}

export function onPTTTimeoutWarning(cb: (data?: unknown) => void) {
  const unlisten = listen<unknown>('ptt-timeout-warning', (event) => cb(event.payload))
  return () => { unlisten.then((fn) => fn()) }
}

export function onToggleHandsFree(cb: (data?: unknown) => void) {
  const unlisten = listen<unknown>('toggle-hands-free', (event) => cb(event.payload))
  return () => { unlisten.then((fn) => fn()) }
}

export function onAIChatPTTDown(cb: (data?: unknown) => void) {
  const unlisten = listen<unknown>('ai-chat-ptt-down', (event) => cb(event.payload))
  return () => { unlisten.then((fn) => fn()) }
}

export function onAIChatPTTUp(cb: (data?: unknown) => void) {
  const unlisten = listen<unknown>('ai-chat-ptt-up', (event) => cb(event.payload))
  return () => { unlisten.then((fn) => fn()) }
}

export function onPTTLabEvent(cb: (data?: unknown) => void) {
  const unlisten = listen<unknown>('ptt-lab-event', (event) => cb(event.payload))
  return () => { unlisten.then((fn) => fn()) }
}

export function onMousePTTChanged(cb: (data: { enabled: boolean }) => void) {
  const unlisten = listen<{ enabled: boolean }>('mouse-ptt-changed', (event) => cb(event.payload))
  return () => { unlisten.then((fn) => fn()) }
}

export function onScrollUpChanged(cb: (data: { enabled: boolean }) => void) {
  const unlisten = listen<{ enabled: boolean }>('scroll-up-changed', (event) => cb(event.payload))
  return () => { unlisten.then((fn) => fn()) }
}

export function onScrollDownChanged(cb: (data: { enabled: boolean }) => void) {
  const unlisten = listen<{ enabled: boolean }>('scroll-down-changed', (event) => cb(event.payload))
  return () => { unlisten.then((fn) => fn()) }
}

export function onUpdateStatus(cb: (status: UpdateStatus) => void) {
  const unlisten = listen<UpdateStatus>('update-status', (event) => cb(event.payload))
  return () => { unlisten.then((fn) => fn()) }
}
