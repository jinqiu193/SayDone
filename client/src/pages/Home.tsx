import { useEffect, useState, useCallback } from 'react'
import { Mic, MicOff, MessageSquare } from 'lucide-react'
import { Page } from '@/components/ui/Page'
import { getSetting } from '@/services/store'
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
}

export default function Home() {
  const [handsFreeKey, setHandsFreeKey] = useState('Alt+L')
  const [pttKey, setPttKey] = useState('右 Alt')
  const [aiChatKey, setAiChatKey] = useState('右 Ctrl')
  const [recorderState, setRecorderState] = useState<RecorderState>('idle')
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    void Promise.all([
      getSetting('shortcutHandsFree', 'Alt+L').then((v) => setHandsFreeKey(v as string)),
      getSetting('shortcutPTT', 'AltRight').then((v) => setPttKey(v as string)),
      getSetting('shortcutAIChat', 'ControlRight').then((v) => setAiChatKey(v as string)),
    ])
  }, [])

  useEffect(() => {
    setStateListener((state) => setRecorderState(state))
  }, [])

  const keyToCodes = (key: string): string[] => {
    const parts = key.split('+')
    return parts.map((p) => {
      const map: Record<string, string> = {
        '左 Alt': 'AltLeft', '右 Alt': 'AltRight',
        '左 Ctrl': 'ControlLeft', '右 Ctrl': 'ControlRight',
        '左 Shift': 'ShiftLeft', '右 Shift': 'ShiftRight',
        '左 Win': 'MetaLeft', '右 Win': 'MetaRight',
        'Alt': 'Alt', 'Alt+L': 'Alt', 'Ctrl': 'Control', 'Control+L': 'Control',
        'Shift': 'Shift', 'Shift+L': 'Shift',
        'Win': 'Meta', '空格': 'Space',
      }
      return map[p] || p
    })
  }

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

  const formatKey = (key: string) => {
    const keyMap: Record<string, string> = {
      'AltLeft': '左 Alt',
      'AltRight': '右 Alt',
      'ControlLeft': '左 Ctrl',
      'ControlRight': '右 Ctrl',
      'ShiftLeft': '左 Shift',
      'ShiftRight': '右 Shift',
      'MetaLeft': '左 Win',
      'MetaRight': '右 Win',
      'Space': '空格',
      'CapsLock': 'Caps Lock',
      'Alt': 'Alt',
      'Control': 'Ctrl',
      'Shift': 'Shift',
    }
    if (key.includes('+')) {
      return key.split('+').map((k) => keyMap[k] || k).join(' + ')
    }
    return keyMap[key] || key
  }

  const shortcutConfigs: ShortcutConfig[] = [
    {
      id: 'ptt',
      label: '按住说话',
      desc: '按住按键开始录音，松开结束',
      shortcut: pttKey,
      keyCodes: keyToCodes(pttKey),
      icon: Mic,
      activeColor: 'bg-cta/10 text-cta border-cta',
      hint: '录音转文字',
    },
    {
      id: 'handsFree',
      label: '免提模式',
      desc: '按一次开始，再按结束',
      shortcut: handsFreeKey,
      keyCodes: keyToCodes(handsFreeKey),
      icon: recorderState === 'recording' ? MicOff : Mic,
      activeColor: 'bg-primary/10 text-primary border-primary',
      hint: '语音转文字',
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
  ]

  const isKeyPressed = (config: ShortcutConfig) => {
    return config.keyCodes.some((code) => pressedKeys.has(code))
  }

  const isRecording = recorderState === 'recording'

  return (
    <Page>
      <div className="mb-10 rounded-2xl bg-gradient-to-br from-primary/5 via-transparent to-primary/10 px-8 py-10">
        <h1 className="max-w-3xl text-3xl font-medium tracking-[0.12em] leading-[1.5] text-foreground sm:text-4xl">
          言出，文成
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-[1.85] text-foreground/80 sm:text-lg">
          用语音代替打字，AI 帮你润色成书面语。
        </p>
      </div>

      <div className="mb-8">
        <h2 className="mb-4 text-lg font-medium text-foreground/80">快捷键教学</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {shortcutConfigs.map((config) => {
            const keyPressed = isKeyPressed(config)
            const isActive = keyPressed || (config.id === 'handsFree' && isRecording)
            return (
              <button
                key={config.id}
                className={`group relative flex flex-col items-center rounded-xl border-2 p-6 text-center transition-all duration-150 ${
                  isActive
                    ? `${config.activeColor} scale-105 shadow-lg`
                    : 'border-border bg-surface-1 hover:bg-surface-2 hover:border-primary/30'
                }`}
              >
                {keyPressed && (
                  <div className="absolute -top-2 -right-2 flex h-4 w-4">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-4 w-4 rounded-full bg-primary" />
                  </div>
                )}
                <div className={`mb-4 rounded-full p-4 transition-colors ${
                  isActive
                    ? 'bg-primary/20'
                    : 'bg-surface-2 group-hover:bg-primary/10'
                }`}>
                  <config.icon className={`h-8 w-8 ${
                    isActive ? 'text-primary' : 'text-foreground/60 group-hover:text-primary'
                  }`} />
                </div>
                <h3 className="mb-1 text-base font-medium">{config.label}</h3>
                <p className="mb-4 text-xs text-muted-foreground">{config.desc}</p>
                <kbd className={`rounded-lg border-2 px-4 py-2 font-mono text-sm font-semibold transition-all ${
                  keyPressed
                    ? 'border-primary bg-primary/10 text-primary scale-110 shadow-md'
                    : 'border-border bg-surface-2 text-foreground/80'
                }`}>
                  {config.shortcut}
                </kbd>
                <p className="mt-3 text-xs text-muted-foreground">{config.hint}</p>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mb-8 rounded-xl border border-border bg-surface-1 p-5">
        <h2 className="mb-4 text-sm font-medium text-foreground/80">使用流程</h2>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">1</div>
            <div>
              <p className="text-sm font-medium">选择输入框</p>
              <p className="text-xs text-muted-foreground">在任意应用中点击文本输入框</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">2</div>
            <div>
              <p className="text-sm font-medium">按下快捷键说话</p>
              <p className="text-xs text-muted-foreground">按住「Alt」键录音，松开自动转文字并润色</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">3</div>
            <div>
              <p className="text-sm font-medium">文字自动插入</p>
              <p className="text-xs text-muted-foreground">润色后的文字自动出现在光标位置</p>
            </div>
          </div>
        </div>
      </div>
    </Page>
  )
}
