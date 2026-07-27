// SettingsCache — RecorderOrchestrator 的运行时设置缓存层
//
// 职责：
// 1. 启动时一次性从 store 加载所有录音相关配置
// 2. 提供对外 getters（由 Orchestrator 在每次 startRecording 前主动调用 refresh）
// 3. 鼠标 PTT / 滚动设置触发对应 IPC
// 4. 不持有任何状态机相关字段（startRecordingLock / processingTimeout 等都在顶层 ctx）
//
// 拆分动机：
// - refreshRuntimeSettings / refreshOverlaySettings / reconnectProvider / updateMouseSettings
//   这 4 个方法只读写配置，与录音生命周期完全无关 → 隔离成独立类便于单测。
// - 后续若加入"配置变更热重载"也只影响本类。

import * as bridge from '../bridge'
import {
  getActiveChatPresetId,
  getActivePresetId,
  getPromptPresets,
  getSetting,
  getSettingsBatch,
  type PromptPreset,
} from '../store'
import { addRuntimeEvent } from '../debugLog'
import type { ClientRuntimeInfo } from '../../types/appApi'
import type { AppPromptRule, UserStats } from '../personalization/types'
import { createDefaultUserStats } from '../personalization/defaults'
import {
  BUILTIN_SET_ACTIVE_KEY,
  BUILTIN_SET_WORDS_KEY,
  CUSTOM_THEME_ACTIVE_KEY,
  CUSTOM_THEMES_KEY,
  composeHotwords,
  normalizeBuiltinSetActive,
  normalizeBuiltinSetWords,
  normalizeCustomThemeActive,
  normalizeCustomThemes,
} from '../hotwords/model'
import type { OverlayService } from './OverlayService'

export class SettingsCache {
  // ─── 缓存字段（由 refresh() 填充）───
  cachedMicId = ''
  cachedPresets: PromptPreset[] = []
  cachedActivePresetId = 'intent'
  cachedActiveChatPresetId = 'chat_writer'
  cachedAiEnabled = true
  cachedClientRuntimeInfo: ClientRuntimeInfo | null = null
  cachedAppPromptRules: AppPromptRule[] = []
  cachedUserStats: UserStats = createDefaultUserStats()
  cachedHotwords: string[] = []
  cachedLanguage: string = ''
  cachedScrollUp?: boolean
  cachedScrollDown?: boolean
  cachedScrollUpThreshold = 1
  cachedScrollDownThreshold = 1

  constructor(private overlayService: OverlayService) {}

  /** 一次性刷新所有录音相关设置。
   *
   * 注意：被 RecorderOrchestrator.refreshRuntimeSettings() 调用；
   * 设置面板保存设置后通过 services/recorder.refreshRecorderSettings() 触发。 */
  async refresh(): Promise<void> {
    const [settingsBatch, appPromptRules, userStats] = await Promise.all([
      getSettingsBatch({
        selectedMic: '',
        aiEnabled: false,
        enablePreviewPartial: true,
        activePresetId: 'intent',
        activeChatPresetId: 'chat_writer',
        serverLanguage: 'auto',
        scrollUpToSend: false,
        scrollDownToDelete: false,
        scrollUpSensitivity: 1,
        scrollDownSensitivity: 1,
        promptPresets: [] as unknown,
        [BUILTIN_SET_WORDS_KEY]: {} as Record<string, unknown>,
        [BUILTIN_SET_ACTIVE_KEY]: {} as Record<string, unknown>,
        [CUSTOM_THEMES_KEY]: [] as unknown[],
        [CUSTOM_THEME_ACTIVE_KEY]: {} as Record<string, unknown>,
      }),
      this.getAppPromptRules(),
      this.getUserStats(),
    ])

    this.cachedMicId = String(settingsBatch.selectedMic || '')
    this.cachedAiEnabled = Boolean(settingsBatch.aiEnabled)
    this.cachedAppPromptRules = appPromptRules
    this.cachedUserStats = userStats

    this.cachedPreviewEnabled = settingsBatch.enablePreviewPartial !== false
    this.cachedActivePresetId = String(settingsBatch.activePresetId || 'intent')
    this.cachedActiveChatPresetId = String(settingsBatch.activeChatPresetId || 'chat_writer')
    this.cachedLanguage = settingsBatch.serverLanguage && settingsBatch.serverLanguage !== 'auto'
      ? String(settingsBatch.serverLanguage)
      : ''

    this.cachedScrollUp = Boolean(settingsBatch.scrollUpToSend)
    this.cachedScrollDown = Boolean(settingsBatch.scrollDownToDelete)
    this.cachedScrollUpThreshold = Number(settingsBatch.scrollUpSensitivity) || 1
    this.cachedScrollDownThreshold = Number(settingsBatch.scrollDownSensitivity) || 1

    const setWords = normalizeBuiltinSetWords(settingsBatch[BUILTIN_SET_WORDS_KEY] as Record<string, unknown>)
    const setActive = normalizeBuiltinSetActive(settingsBatch[BUILTIN_SET_ACTIVE_KEY] as Record<string, unknown>)
    const themes = normalizeCustomThemes(settingsBatch[CUSTOM_THEMES_KEY])
    const themeActive = normalizeCustomThemeActive(settingsBatch[CUSTOM_THEME_ACTIVE_KEY] as Record<string, unknown>, themes)
    this.cachedHotwords = composeHotwords([], setWords, setActive, themes, themeActive)

    await this.overlayService.refreshSettings()

    try {
      this.cachedClientRuntimeInfo = await bridge.getClientRuntimeInfo()
    } catch {
      this.cachedClientRuntimeInfo = null
    }
  }

  /** 仅刷新 overlay 显示设置（主题/长度/时长）— 不触发 IPC 大军 */
  async refreshOverlay(): Promise<void> {
    await this.overlayService.refreshSettings()
  }

  /** previewEnabled 单独存储（避免破坏 ctx 接口） */
  private cachedPreviewEnabled = true

  /** 预览开关：被 PreviewEngine 调用；true 时启用流式预览 */
  isPreviewEnabled(): boolean {
    return this.cachedPreviewEnabled
  }

  // ─── 鼠标 PTT / 滚动 IPC ───

  updateMouseSettings(key: 'mouse_ptt' | 'scroll_up' | 'scroll_down', enabled: boolean): void {
    switch (key) {
      case 'mouse_ptt':
        void bridge.invoke('set_mouse_ptt_enabled', { enabled })
        break
      case 'scroll_up':
        void bridge.invoke('set_mouse_scroll_actions', {
          upSend: enabled,
          downDelete: this.cachedScrollDown ?? false,
          upThreshold: this.cachedScrollUpThreshold,
          downThreshold: this.cachedScrollDownThreshold,
        })
        break
      case 'scroll_down':
        void bridge.invoke('set_mouse_scroll_actions', {
          upSend: this.cachedScrollUp ?? false,
          downDelete: enabled,
          upThreshold: this.cachedScrollUpThreshold,
          downThreshold: this.cachedScrollDownThreshold,
        })
        break
    }
  }

  // ─── 用户统计更新（被 ResultDispatcher.processFinalResult 调用）───

  setUserStats(stats: UserStats): void {
    this.cachedUserStats = stats
  }

  // ─── lazy import 避免循环依赖 ───

  private async getAppPromptRules(): Promise<AppPromptRule[]> {
    const { getAppPromptRules } = await import('../personalization/store')
    return getAppPromptRules()
  }

  private async getUserStats(): Promise<UserStats> {
    const { getUserStats } = await import('../personalization/store')
    return getUserStats()
  }
}