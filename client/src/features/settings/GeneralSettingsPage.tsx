// 通用设置页面 — 主题、快捷键、麦克风、悬浮窗、开机启动、音频保留、数据导出

import * as bridge from '@/services/bridge'
import { refreshPTTSetting } from '@/services/webviewKeyboardFallback'
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Download, FolderOpen, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import PageSection from '@/components/ui/PageSection'
import SettingRow from '@/components/ui/SettingRow'
import ToggleChip from '@/components/ui/ToggleChip'
import { listMicrophones } from '@/services/audio'
import { exportAllDataBundle, exportSettings } from '@/services/exports'
import { refreshRecorderSettings } from '@/services/recorder'
import { getSetting, setSetting } from '@/services/store'
import { Switch } from '@/components/ui/switch'
import AppSection from './AppSection'
import MicrophoneSection from './MicrophoneSection'
import { ComboShortcutInput, PTTShortcutInput } from './ShortcutInputs'

export default function GeneralSettingsPage() {
  const [autoLaunch, setAutoLaunch] = useState(false)
  const [autoCheckUpdate, setAutoCheckUpdate] = useState(false)
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [selectedMic, setSelectedMic] = useState('')
  const [testing, setTesting] = useState(false)
  const [pttKey, setPttKey] = useState('AltLeft')
  const [handsFreeKey, setHandsFreeKey] = useState('Alt+L')
  const [aiChatKey, setAiChatKey] = useState('ControlRight')
  const [mousePttEnabled, setMousePttEnabled] = useState(false)
  const [scrollUpToSend, setScrollUpToSend] = useState(false)
  const [scrollDownToDelete, setScrollDownToDelete] = useState(false)
  const [scrollUpSensitivity, setScrollUpSensitivity] = useState(1)
  const [scrollDownSensitivity, setScrollDownSensitivity] = useState(1)
  const [audioRetentionEnabled, setAudioRetentionEnabled] = useState(true)
  const [audioRetentionDays, setAudioRetentionDays] = useState(30)
  const [logRetentionDays, setLogRetentionDays] = useState(30)
  const [readySoundEnabled, setReadySoundEnabled] = useState(true)

  useEffect(() => {
    bridge.getAutoLaunch().then(setAutoLaunch)
    getSetting('autoCheckUpdate', false).then((value) => setAutoCheckUpdate(Boolean(value)))
    getSetting('selectedMic', '').then(setSelectedMic)
    getSetting('shortcutPTT', 'AltRight').then((value) => setPttKey(value as string))
    getSetting('shortcutHandsFree', 'Alt+L').then((value) => setHandsFreeKey(value as string))
    getSetting('shortcutAIChat', 'ControlRight').then((value) => setAiChatKey(value as string))
    getSetting('mouseMiddleButtonPTT', false).then((value) => setMousePttEnabled(Boolean(value)))
    getSetting('scrollUpToSend', false).then((value) => setScrollUpToSend(Boolean(value)))
    getSetting('scrollDownToDelete', false).then((value) => setScrollDownToDelete(Boolean(value)))
    getSetting('scrollUpSensitivity', 1).then((value) => setScrollUpSensitivity(Number(value) || 1))
    getSetting('scrollDownSensitivity', 1).then((value) => setScrollDownSensitivity(Number(value) || 1))
    getSetting('audioRetentionEnabled', true).then((value) => setAudioRetentionEnabled(Boolean(value)))
    getSetting('readySoundEnabled', true).then((value) => setReadySoundEnabled(Boolean(value)))
    getSetting('audioRetentionDays', -1).then((value) => {
      const v = Number(value)
      if (v === 7 || v === 30 || v === 90 || v === -1) setAudioRetentionDays(v)
    })
    getSetting('logRetentionDays', 30).then((value) => {
      const v = Number(value)
      if (v === 7 || v === 15 || v === 30 || v === 90) setLogRetentionDays(v)
    })
    listMicrophones().then(setMics).catch(() => {})
  }, [])

  const toggleAutoLaunch = async () => { const next = !autoLaunch; setAutoLaunch(next); await bridge.setAutoLaunch(next) }
  const toggleAutoCheckUpdate = async () => { const next = !autoCheckUpdate; setAutoCheckUpdate(next); await setSetting('autoCheckUpdate', next) }
  const handleMicChange = async (deviceId: string) => { setSelectedMic(deviceId); await setSetting('selectedMic', deviceId); await refreshRecorderSettings() }
  const toggleAudioRetention = async () => { const next = !audioRetentionEnabled; setAudioRetentionEnabled(next); await setSetting('audioRetentionEnabled', next) }
  const toggleReadySound = async () => { const next = !readySoundEnabled; setReadySoundEnabled(next); await setSetting('readySoundEnabled', next); await refreshRecorderSettings() }
  const handleAudioRetentionDaysChange = async (value: number) => { setAudioRetentionDays(value); await setSetting('audioRetentionDays', value) }
  const handleLogRetentionDaysChange = async (value: number) => { setLogRetentionDays(value); await setSetting('logRetentionDays', value) }
  const handlePTTChange = async (value: string) => { setPttKey(value); await setSetting('shortcutPTT', value); bridge.notifyShortcutsChanged(); refreshPTTSetting() }
  const handleHandsFreeChange = async (value: string) => { setHandsFreeKey(value); await setSetting('shortcutHandsFree', value); bridge.notifyShortcutsChanged(); refreshPTTSetting() }
  const handleAIChatChange = async (value: string) => {
    if (!value) {
      setAiChatKey(value); await setSetting('shortcutAIChat', value); bridge.notifyShortcutsChanged(); refreshPTTSetting(); return
    }
    const conflictKey =
      value === pttKey ? '按住说话' :
      value === handsFreeKey ? '免提模式' :
      null
    if (conflictKey) {
      const ok = window.confirm(`该键已绑定到「${conflictKey}」，冲突时只会触发其中一个。是否仍要保存？`)
      if (!ok) return
    }
    setAiChatKey(value)
    await setSetting('shortcutAIChat', value)
    bridge.notifyShortcutsChanged()
    refreshPTTSetting()
  }
  const toggleMousePtt = async () => { const next = !mousePttEnabled; setMousePttEnabled(next); await invoke('set_mouse_ptt_enabled', { enabled: next }) }
  const toggleScrollUpToSend = async () => {
    const next = !scrollUpToSend
    setScrollUpToSend(next)
    await invoke('set_mouse_scroll_actions', { upSend: next, downDelete: scrollDownToDelete, upThreshold: scrollUpSensitivity, downThreshold: scrollDownSensitivity })
  }
  const toggleScrollDownToDelete = async () => {
    const next = !scrollDownToDelete
    setScrollDownToDelete(next)
    await invoke('set_mouse_scroll_actions', { upSend: scrollUpToSend, downDelete: next, upThreshold: scrollUpSensitivity, downThreshold: scrollDownSensitivity })
  }
  const handleScrollUpSensitivityChange = async (value: number) => {
    setScrollUpSensitivity(value)
    await setSetting('scrollUpSensitivity', value)
    await invoke('set_mouse_scroll_actions', { upSend: scrollUpToSend, downDelete: scrollDownToDelete, upThreshold: value, downThreshold: scrollDownSensitivity })
  }
  const handleScrollDownSensitivityChange = async (value: number) => {
    setScrollDownSensitivity(value)
    await setSetting('scrollDownSensitivity', value)
    await invoke('set_mouse_scroll_actions', { upSend: scrollUpToSend, downDelete: scrollDownToDelete, upThreshold: scrollUpSensitivity, downThreshold: value })
  }

  const [exportResult, setExportResult] = useState<{ filePath: string | null; canceled: boolean } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null)

  const handleExportSettings = async () => {
    const r = await exportSettings()
    setExportResult(r)
    if (!r.canceled) setTimeout(() => setExportResult(null), 8000)
  }
  const handleExportAll = async () => {
    setExporting(true)
    setExportProgress(null)
    const unlisten = await listen<{ current: number; total: number }>('export-progress', (e) => {
      setExportProgress({ current: e.payload.current, total: e.payload.total })
    })
    try {
      const r = await exportAllDataBundle()
      setExportResult(r)
      if (!r.canceled) setTimeout(() => setExportResult(null), 15000)
    } finally {
      unlisten()
      setExporting(false)
      setExportProgress(null)
    }
  }
  const handleRevealExport = () => {
    if (exportResult?.filePath) {
      void invoke('reveal_file_in_folder', { filePath: exportResult.filePath })
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-bold">设置</h1>
      <div className="space-y-6">
        <PageSection title="键盘快捷键">
          <SettingRow
            label="免提模式"
            description="按一次开始，再按一次结束，支持单键或组合键"
            control={<ComboShortcutInput value={handsFreeKey} onChange={handleHandsFreeChange} />}
          />
          <SettingRow
            divided
            label="按住说话"
            description="按住按键开始录音，松开结束，支持单个按键"
            control={<PTTShortcutInput value={pttKey} onChange={handlePTTChange} />}
          />
          <SettingRow
            divided
            label="AI 对话快捷键"
            description="按住开始录音，松开后发送给 AI 大模型回答并注入光标位置"
            control={<PTTShortcutInput value={aiChatKey} onChange={handleAIChatChange} />}
          />
        </PageSection>

        <PageSection title="鼠标快捷设置">
          <SettingRow
            label="鼠标中键按住说话"
            description="按住鼠标中键开始录音，松开结束。可与键盘 PTT 同时启用"
            control={<Switch checked={mousePttEnabled} onChange={() => void toggleMousePtt()} />}
          />
          <SettingRow
            label="滚轮上滚 = 发送"
            description="聚焦于输入框时，滚轮向上滚动发送消息（Enter）"
            divided
            control={<Switch checked={scrollUpToSend} onChange={() => void toggleScrollUpToSend()} />}
          />
          {scrollUpToSend && (
            <div className="mt-3 flex items-center gap-3 pl-4">
              <span className="text-xs text-muted-foreground">灵敏度</span>
              <input
                type="range" min="1" max="10" value={scrollUpSensitivity}
                onChange={(e) => void handleScrollUpSensitivityChange(Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-6 text-right text-xs text-muted-foreground">{scrollUpSensitivity}</span>
            </div>
          )}
          <SettingRow
            label="滚轮下滚 = 逐字删除"
            description="聚焦于输入框时，滚轮向下滚动逐字删除（Backspace）"
            divided
            control={<Switch checked={scrollDownToDelete} onChange={() => void toggleScrollDownToDelete()} />}
          />
          {scrollDownToDelete && (
            <div className="mt-3 flex items-center gap-3 pl-4">
              <span className="text-xs text-muted-foreground">灵敏度</span>
              <input
                type="range" min="1" max="10" value={scrollDownSensitivity}
                onChange={(e) => void handleScrollDownSensitivityChange(Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-6 text-right text-xs text-muted-foreground">{scrollDownSensitivity}</span>
            </div>
          )}
        </PageSection>

        <PageSection title="准备就绪提示音" divided={false}>
          <SettingRow
            label="录音就绪提示音"
            description="按下热键后，录音准备好时播放一声短促提示音"
            control={<Switch checked={readySoundEnabled} onChange={() => void toggleReadySound()} />}
          />
        </PageSection>

        <MicrophoneSection
          mics={mics}
          selectedMic={selectedMic}
          testing={testing}
          onMicChange={handleMicChange}
          onTestingChange={setTesting}
        />

        <AppSection autoLaunch={autoLaunch} onToggleAutoLaunch={toggleAutoLaunch} autoCheckUpdate={autoCheckUpdate} onToggleAutoCheckUpdate={toggleAutoCheckUpdate} />

        <PageSection
          title="音频保留"
          description="录音结束后自动保存音频文件到本地，可在历史记录中回放和重新识别。"
          action={<Switch checked={audioRetentionEnabled} onChange={() => void toggleAudioRetention()} />}
        >
          {audioRetentionEnabled && (
            <div>
              <label className="text-sm text-muted-foreground">保留时长</label>
              <div className="mt-2 flex gap-2">
                {([{ value: 7, label: '7 天' }, { value: 30, label: '1 个月' }, { value: 90, label: '3 个月' }, { value: -1, label: '永久' }] as const).map((opt) => (
                  <ToggleChip
                    key={opt.value}
                    selected={audioRetentionDays === opt.value}
                    onClick={() => void handleAudioRetentionDaysChange(opt.value)}
                  >
                    {opt.label}
                  </ToggleChip>
                ))}
              </div>
            </div>
          )}
        </PageSection>

        <PageSection title="日志保留" description="运行日志用于排查问题，超过保留时长的日志将自动清理。">
          <div className="flex gap-2">
            {([{ value: 7, label: '7 天' }, { value: 15, label: '15 天' }, { value: 30, label: '1 个月' }, { value: 90, label: '3 个月' }] as const).map((opt) => (
              <ToggleChip
                key={opt.value}
                selected={logRetentionDays === opt.value}
                onClick={() => void handleLogRetentionDaysChange(opt.value)}
              >
                {opt.label}
              </ToggleChip>
            ))}
          </div>
        </PageSection>

        <PageSection
          title="数据导出"
          description="可导出当前设置，或一键打包导出历史、收藏、热词和设置。"
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void handleExportSettings()}>
                <Download className="mr-1 h-4 w-4" />导出设置
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void handleExportAll()} disabled={exporting}>
                <Download className="mr-1 h-4 w-4" />{exporting ? '导出中...' : '导出全部（含音频）'}
              </Button>
            </div>
          }
        >
          {exporting && exportProgress && (
            <div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.round((exportProgress.current / exportProgress.total) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {exportProgress.current} / {exportProgress.total} 文件
              </p>
            </div>
          )}
          {exportResult && !exportResult.canceled && exportResult.filePath && (
            <div className="flex items-center gap-2 text-xs text-success">
              <Check className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 truncate">已保存到 {exportResult.filePath}</span>
              <button
                onClick={handleRevealExport}
                className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {exportResult?.canceled && (
            <p className="text-xs text-muted-foreground">已取消导出。</p>
          )}
        </PageSection>
      </div>
    </div>
  )
}