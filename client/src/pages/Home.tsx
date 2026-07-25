import { useEffect, useState, useCallback, useMemo } from 'react'
import { Mic, MicOff, MessageSquare, Volume2, Zap } from 'lucide-react'
import { Page } from '@/components/ui/Page'
import { getSettingsBatch } from '@/services/store'
import { setStateListener } from '@/services/recorder'
import type { RecorderState } from '@/services/recorder/types'

interface ShortcutConfig {
  id: 'ptt' | 'handsFree' | 'aiChat'
  label: string
  desc: string
  shortcut: string
  keyCodes: string[]
  icon: typeof Mic
  activeColor: string
  hint: string
  badge?: string
}

const SHORTCUT_DISPLAY_MAP: Record<string, string> = {
  'ShiftRight': '右 Shift', 'ShiftLeft': '左 Shift', 'Shift': 'Shift',
  'AltRight': '右 Alt', 'AltLeft': '左 Alt', 'Alt': 'Alt',
  'ControlRight': '右 Ctrl', 'ControlLeft': '左 Ctrl', 'Control': 'Ctrl',
  'MetaRight': '右 Win', 'MetaLeft': '左 Win', 'Meta': 'Win',
  'Space': '空格', 'MouseMiddleButton': '鼠标中键',
  'ArrowUp': '↑', 'ArrowDown': '↓', 'ArrowLeft': '←', 'ArrowRight': '→',
  'Enter': '回车', 'Backspace': '退格', 'Delete': '删除', 'Tab': 'Tab',
}

function formatShortcutDisplay(shortcut: string): string {
  const parts = shortcut.split('+')
  return parts.map(p => SHORTCUT_DISPLAY_MAP[p] || p).join(' + ')
}

const KEY_TO_CODES_MAP: Record<string, string> = {
  '左 Alt': 'AltLeft', '右 Alt': 'AltRight', 'Alt': 'Alt',
  '左 Ctrl': 'ControlLeft', '右 Ctrl': 'ControlRight', 'Ctrl': 'Control',
  '左 Shift': 'ShiftLeft', '右 Shift': 'ShiftRight', 'Shift': 'Shift',
  '左 Win': 'MetaLeft', '右 Win': 'MetaRight', 'Win': 'Meta',
  '空格': 'Space',
}

function keyToCodes(key: string): string[] {
  return [KEY_TO_CODES_MAP[key] || key]
}

function getStatusText(state: RecorderState): string {
  switch (state) {
    case 'idle': return '准备就绪'
    case 'recording': return '正在录音...'
    case 'processing': return '处理中...'
    default: return '准备就绪'
  }
}

function getStatusColor(state: RecorderState): string {
  switch (state) {
    case 'recording': return 'text-cta'
    case 'processing': return 'text-warning'
    default: return 'text-muted-foreground'
  }
}

export default function Home() {
  const [handsFreeKey, setHandsFreeKey] = useState('Shift')
  const [pttKey, setPttKey] = useState('Alt')
  const [aiChatKey, setAiChatKey] = useState('Ctrl')
  const [recorderState, setRecorderState] = useState<RecorderState>('idle')
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    void (async () => {
      const batch = await getSettingsBatch({
        shortcutHandsFree: 'Shift',
        shortcutPTT: 'Alt',
        shortcutAIChat: 'Control',
      })
      setHandsFreeKey(formatShortcutDisplay(String(batch.shortcutHandsFree)))
      setPttKey(formatShortcutDisplay(String(batch.shortcutPTT)))
      setAiChatKey(formatShortcutDisplay(String(batch.shortcutAIChat)))
    })()
  }, [])

  useEffect(() => {
    setStateListener((state) => setRecorderState(state))
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.repeat) return
    const code = e.code
    const altKey = e.altKey ? 'Alt' : ''
    const ctrlKey = e.ctrlKey ? 'Control' : ''
    const shiftKey = e.shiftKey ? 'Shift' : ''
    const metaKey = e.metaKey ? 'Meta' : ''

    setPressedKeys((prev) => {
      const next = new Set(prev)
      next.add(code)
      if (altKey) next.add(altKey)
      if (ctrlKey) next.add(ctrlKey)
      if (shiftKey) next.add(shiftKey)
      if (metaKey) next.add(metaKey)
      return next
    })
  }, [])

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    const code = e.code
    const altKey = e.altKey ? 'Alt' : ''
    const ctrlKey = e.ctrlKey ? 'Control' : ''
    const shiftKey = e.shiftKey ? 'Shift' : ''
    const metaKey = e.metaKey ? 'Meta' : ''

    setPressedKeys((prev) => {
      const next = new Set(prev)
      next.delete(code)
      next.delete(altKey)
      next.delete(ctrlKey)
      next.delete(shiftKey)
      next.delete(metaKey)
      return next
    })
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [handleKeyDown, handleKeyUp])

  const isRecording = recorderState === 'recording'
  const isProcessing = recorderState === 'processing'
  const statusText = getStatusText(recorderState)
  const statusColor = getStatusColor(recorderState)

  const shortcutConfigs = useMemo<ShortcutConfig[]>(() => [
    {
      id: 'ptt',
      label: '按住说话',
      desc: '按住按键开始录音，松开结束',
      shortcut: pttKey,
      keyCodes: keyToCodes(pttKey),
      icon: Volume2,
      activeColor: 'bg-cta/10 text-cta border-cta',
      hint: '录音转文字',
      badge: isRecording ? '录音中' : undefined,
    },
    {
      id: 'handsFree',
      label: '免提模式',
      desc: '按一次开始，再按结束',
      shortcut: handsFreeKey,
      keyCodes: keyToCodes(handsFreeKey),
      icon: isRecording ? MicOff : Mic,
      activeColor: 'bg-primary/10 text-primary border-primary',
      hint: '语音转文字',
      badge: isRecording ? '录音中' : undefined,
    },
    {
      id: 'aiChat',
      label: 'AI 对话',
      desc: '按住录音，松开后 AI 回复',
      shortcut: aiChatKey,
      keyCodes: keyToCodes(aiChatKey),
      icon: MessageSquare,
      activeColor: 'bg-warning/10 text-warning border-warning',
      hint: 'AI 指令对话',
    },
  ], [pttKey, handsFreeKey, aiChatKey, isRecording])

  const isKeyPressed = useCallback((config: ShortcutConfig) => {
    return config.keyCodes.some((code) => pressedKeys.has(code))
  }, [pressedKeys])

  return (
    <Page>
      {/* 顶部标题区 */}
      <div className="mb-8 rounded-2xl bg-gradient-to-br from-primary/5 via-transparent to-primary/10 px-8 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-medium tracking-[0.12em] leading-[1.5] text-foreground sm:text-4xl">
              言出，文成
            </h1>
            <p className="mt-3 max-w-xl text-base leading-[1.85] text-foreground/80 sm:text-lg">
              用语音代替打字，AI 帮你润色成书面语。
            </p>
          </div>
          {/* 状态指示器 */}
          <div className="hidden items-center gap-3 sm:flex">
            <div className={`flex items-center gap-2 rounded-full border px-4 py-2 transition-all ${isRecording ? 'border-cta bg-cta/10 animate-pulse' : isProcessing ? 'border-warning bg-warning/10' : 'border-border bg-surface-1'}`}>
              {isRecording ? (
                <div className="h-2 w-2 rounded-full bg-cta animate-bounce" />
              ) : isProcessing ? (
                <div className="h-2 w-2 rounded-full bg-warning animate-pulse" />
              ) : (
                <div className="h-2 w-2 rounded-full bg-muted-foreground/50" />
              )}
              <span className={`text-sm font-medium ${statusColor}`}>
                {statusText}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 快捷键教学 */}
      <div className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-medium text-foreground/80">
          <Zap className="h-5 w-5 text-primary" />
          快捷键教学
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {shortcutConfigs.map((config) => {
            const keyPressed = isKeyPressed(config)
            const isActive = keyPressed || (config.id === 'handsFree' && isRecording)
            return (
              <button
                key={config.id}
                className={`group relative flex flex-col items-center rounded-xl border-2 p-6 text-center transition-all duration-200 ${
                  isActive
                    ? `${config.activeColor} scale-[1.02] shadow-lg`
                    : 'border-border bg-surface-1 hover:bg-surface-2 hover:border-primary/30'
                }`}
              >
                {/* 按下指示灯 */}
                {keyPressed && (
                  <div className="absolute -top-2 -right-2 flex h-5 w-5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-5 w-5 rounded-full bg-primary" />
                  </div>
                )}
                {/* 录音中徽章 */}
                {config.badge && !keyPressed && (
                  <div className="absolute -top-2 -right-2 rounded-full bg-cta px-2 py-0.5 text-[10px] font-medium text-white">
                    {config.badge}
                  </div>
                )}

                {/* 图标 */}
                <div className={`mb-4 rounded-full p-4 transition-all duration-300 ${
                  isActive
                    ? 'bg-primary/20 scale-110'
                    : 'bg-surface-2 group-hover:bg-primary/10'
                }`}>
                  <config.icon className={`h-8 w-8 transition-all duration-300 ${
                    isActive ? 'text-primary scale-110' : 'text-foreground/60 group-hover:text-primary'
                  }`} />
                </div>

                {/* 标签 */}
                <h3 className="mb-1 text-base font-medium">{config.label}</h3>
                <p className="mb-4 text-xs text-muted-foreground">{config.desc}</p>

                {/* 快捷键 */}
                <kbd className={`rounded-lg border-2 px-4 py-2 font-mono text-sm font-semibold transition-all duration-200 ${
                  keyPressed
                    ? 'border-primary bg-primary/10 text-primary scale-110 shadow-md'
                    : 'border-border bg-surface-2 text-foreground/80'
                }`}>
                  {config.shortcut}
                </kbd>

                {/* 提示 */}
                <p className="mt-3 text-xs text-muted-foreground">{config.hint}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* 使用流程 */}
      <div className="rounded-xl border border-border bg-surface-1 p-6">
        <h2 className="mb-5 flex items-center gap-2 text-sm font-medium text-foreground/80">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">?</span>
          快速上手
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cta/10 text-sm font-medium text-cta">1</div>
            <div>
              <p className="text-sm font-medium">聚焦输入框</p>
              <p className="mt-1 text-xs text-muted-foreground">在任何应用中点击文本输入框，让光标闪烁</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cta/10 text-sm font-medium text-cta">2</div>
            <div>
              <p className="text-sm font-medium">按住快捷键说话</p>
              <p className="mt-1 text-xs text-muted-foreground">按住 <span className="font-medium text-foreground">Alt</span> 键开始录音，松开自动转文字</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cta/10 text-sm font-medium text-cta">3</div>
            <div>
              <p className="text-sm font-medium">文字自动出现</p>
              <p className="mt-1 text-xs text-muted-foreground">润色后的文字会神奇地出现在光标位置</p>
            </div>
          </div>
        </div>
      </div>

      {/* 提示卡片 */}
      <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-primary">提示：</span>
          按下快捷键时，首页会实时高亮显示对应的功能卡片，帮助你确认操作是否正确。
        </p>
      </div>
    </Page>
  )
}
