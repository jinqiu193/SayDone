import { useEffect, useRef, useState } from 'react'
import { Mic, Sparkles, Globe, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, Keyboard, Loader2, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { getSetting, setSetting } from '@/services/store'
import { getWorkMode } from '@/services/transcription'
import { healthCheck } from '@/services/api'
import { setPttSuppressed } from '@/services/recorder'
import * as bridge from '@/services/bridge'
import appIcon from '@/assets/icon-128.png'
import { ROLES, SCENARIOS, MAX_PICKS_PER_CATEGORY, defaultThemeName } from '@/services/hotwords/roles'

const KEY_MAP: Record<string, string> = {
  AltLeft: '左 Alt', AltRight: '右 Alt',
  ControlLeft: '左 Ctrl', ControlRight: '右 Ctrl',
  ShiftLeft: '左 Shift', ShiftRight: '右 Shift',
  MetaLeft: '左 Win', MetaRight: '右 Win',
  Space: '空格', CapsLock: 'Caps Lock',
}

/** 简化键盘布局，高亮当前快捷键 */
function KeyboardHint({ activeKey, pressed }: { activeKey: string; pressed?: boolean }) {
  const rows: { code: string; label: string; w?: number }[][] = [
    [
      { code: 'ShiftLeft', label: 'Shift', w: 52 },
      { code: 'KeyZ', label: 'Z' }, { code: 'KeyX', label: 'X' },
      { code: 'KeyC', label: 'C' }, { code: 'KeyV', label: 'V' },
      { code: 'KeyB', label: 'B' }, { code: 'KeyN', label: 'N' },
      { code: 'KeyM', label: 'M' }, { code: 'Comma', label: '<' },
      { code: 'Period', label: '>' }, { code: 'Slash', label: '?' },
      { code: 'ShiftRight', label: 'Shift', w: 52 },
    ],
    [
      { code: 'ControlLeft', label: 'Ctrl', w: 42 },
      { code: 'MetaLeft', label: 'Win', w: 34 },
      { code: 'AltLeft', label: 'Alt', w: 34 },
      { code: 'Space', label: '空格', w: 148 },
      { code: 'AltRight', label: 'Alt', w: 34 },
      { code: 'ControlRight', label: 'Ctrl', w: 42 },
    ],
  ]

  return (
    <div className="flex flex-col items-center gap-1">
      {rows.map((row, ri) => (
        <div key={ri} className="flex items-center justify-center gap-1">
          {row.map((key) => {
            const isActive = key.code === activeKey
            const isPressed = isActive && pressed
            return (
              <div
                key={key.code}
                className={`flex items-center justify-center rounded-md transition-all ${
                  isPressed
                    ? 'bg-foreground text-background font-bold shadow-lg ring-2 ring-foreground/30 scale-110'
                    : isActive
                      ? 'bg-primary text-primary-foreground font-semibold shadow-sm ring-2 ring-primary/30'
                      : 'border border-border/60 bg-muted/30 text-muted-foreground'
                }`}
                style={{
                  width: isActive ? (key.w || 30) + 4 : key.w || 30,
                  height: isActive ? 32 : 28,
                  fontSize: isActive ? 12 : 10,
                }}
              >
                {key.label}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

const MODE_LABELS: Record<string, string> = {
  server: '服务器模式',
  cloud_api: '云 API 模式',
  local: '本地模式',
}

interface WelcomeGuideProps {
  onComplete: () => void
}

export default function WelcomeGuide({ onComplete }: WelcomeGuideProps) {
  const [step, setStep] = useState(0)
  const [hfKey, setHfKey] = useState('AltRight')
  const [hfLabel, setHfLabel] = useState('右 Alt')
  const [workMode, setWorkMode] = useState('')
  const [serverOk, setServerOk] = useState<boolean | null>(null)
  const [testText, setTestText] = useState('')
  const [listeningKey, setListeningKey] = useState(false)
  // 热键确认步骤的状态
  const [keyConfirmed, setKeyConfirmed] = useState(false)
  const [keyPressed, setKeyPressed] = useState(false)
  const keyPressedRef = useRef(false)
  const hfKeyRef = useRef('AltRight')
  const settingsDirtyRef = useRef(false)

  // AI 热词生成（Step 4）状态
  const [pickedRoles, setPickedRoles] = useState<string[]>([])
  const [pickedScenarios, setPickedScenarios] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [generatedWords, setGeneratedWords] = useState<string[]>([])
  const [generatedSource, setGeneratedSource] = useState<string>('')
  const [generatedElapsed, setGeneratedElapsed] = useState<number>(0)
  const [genError, setGenError] = useState<string | null>(null)
  const [themeName, setThemeName] = useState<string>('')
  const [themeSaved, setThemeSaved] = useState(false)

  useEffect(() => {
    getSetting('shortcutHandsFree', 'AltRight').then((k) => {
      const key = k as string
      setHfKey(key)
      setHfLabel(KEY_MAP[key] || key)
      hfKeyRef.current = key
    })
    const mode = getWorkMode()
    setWorkMode(mode)
    if (mode === 'server') {
      healthCheck().then(() => setServerOk(true)).catch(() => setServerOk(false))
    }
  }, [])

  // 热键确认步骤：监听按键按下和松开，同时抑制录音系统响应热键
  // 只依赖 step，避免 hfKey 变化导致 effect 反复运行和钩子反复重启
  useEffect(() => {
    if (step !== 2) return
    setPttSuppressed(true)
    const pressedKeyCodeRef = { current: '' } // 当前按住的键

    const confirmKey = (code: string) => {
      const label = KEY_MAP[code] || code
      // 保存到 ref，避免 state 更新触发 effect 重启
      hfKeyRef.current = code
      settingsDirtyRef.current = true
      // 更新 UI 状态（state 更新不会触发 effect 重建，因为 state 不在依赖里）
      setHfKey(code)
      setHfLabel(label)
      setKeyPressed(true)
      keyPressedRef.current = true
      pressedKeyCodeRef.current = code
      setKeyConfirmed(true)
    }

    const releaseKey = () => {
      if (keyPressedRef.current) {
        keyPressedRef.current = false
        setKeyPressed(false)
      }
      pressedKeyCodeRef.current = ''
    }

    // 路径 1：webview 能收到的按键（右 Ctrl 等）
    const onDown = (e: KeyboardEvent) => {
      e.preventDefault()
      const code = e.code
      if (KEY_MAP[code] && pressedKeyCodeRef.current !== code) {
        confirmKey(code)
      }
    }
    const onUp = (e: KeyboardEvent) => {
      e.preventDefault()
      if (pressedKeyCodeRef.current === e.code) {
        releaseKey()
      }
    }

    // 路径 2：被 Rust 钩子拦截的按键（右 Alt）—— keyup 时触发
    const unlistenHf = bridge.listen('toggle-hands-free', () => {
      // Rust 端只在 keyup 时 emit，模拟"按下-松开"的视觉反馈
      confirmKey(hfKeyRef.current || 'AltRight')
      setTimeout(() => releaseKey(), 150)
    })

    // 路径 3：PTT 键 keydown/keyup
    const unlistenPttDown = bridge.listen('ptt-down', (event: unknown) => {
      const payload = event as { payload?: { pttSetting?: string } }
      const setting = payload?.payload?.pttSetting
      if (setting && KEY_MAP[setting] && pressedKeyCodeRef.current !== setting) {
        confirmKey(setting)
      }
    })
    const unlistenPttUp = bridge.listen('ptt-up', () => {
      releaseKey()
    })

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      setPttSuppressed(false)
      unlistenHf.then((fn) => fn())
      unlistenPttDown.then((fn) => fn())
      unlistenPttUp.then((fn) => fn())

      // 离开 Step 2 时统一保存设置并重配置键盘钩子
      if (settingsDirtyRef.current) {
        settingsDirtyRef.current = false
        void (async () => {
          await setSetting('shortcutHandsFree', hfKeyRef.current)
          bridge.notifyShortcutsChanged()
        })()
      }
    }
  }, [step])

  // 试一试步骤：监听按键修改快捷键
  useEffect(() => {
    if (!listeningKey) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      const code = e.code
      const label = KEY_MAP[code]
      if (label) {
        setHfKey(code)
        setHfLabel(label)
        void (async () => {
          await setSetting('shortcutHandsFree', code)
          bridge.notifyShortcutsChanged()
        })()
      }
      setListeningKey(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [listeningKey])

  const canTest = workMode === 'server' && serverOk === true
  const totalSteps = 6
  const isLast = step === totalSteps - 1

  // ─── Step 4 handlers: AI 生成热词 ──────────────────────────────────────────
  const togglePick = (
    list: string[],
    setter: (v: string[]) => void,
    item: string,
  ) => {
    if (list.includes(item)) {
      setter(list.filter((x) => x !== item))
    } else if (list.length < MAX_PICKS_PER_CATEGORY) {
      setter([...list, item])
    }
  }

  const handleGenerateHotwords = async () => {
    if (pickedRoles.length === 0 || pickedScenarios.length === 0) return
    setGenerating(true)
    setGenError(null)
    setGeneratedWords([])
    setGeneratedSource('')
    setGeneratedElapsed(0)
    setThemeSaved(false)
    try {
      // 读 AI 配置
      const provider = ((await getSetting('cloudAi.provider', 'openai_compat')) as string) || 'openai_compat'
      const apiUrl = ((await getSetting('cloudAi.apiUrl', '')) as string) || ''
      const apiKey = ((await getSetting('cloudAi.apiKey', '')) as string) || ''
      const model = ((await getSetting('cloudAi.model', '')) as string) || ''

      const result = await bridge.aiGenerateHotwords({
        roles: pickedRoles,
        scenarios: pickedScenarios,
        aiConfig: { provider, api_url: apiUrl, api_key: apiKey, model },
      })

      setGeneratedWords(result.words)
      setGeneratedSource(result.source)
      setGeneratedElapsed(result.elapsed_ms)
      if (!themeName.trim()) {
        setThemeName(defaultThemeName(pickedRoles, pickedScenarios))
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  const handleSaveTheme = async () => {
    if (generatedWords.length === 0) return
    const finalName = themeName.trim() || defaultThemeName(pickedRoles, pickedScenarios)
    try {
      // 直接读写 app_settings，绕开 useHotwordsManager（WelcomeGuide 不挂那个 hook）
      const themesRaw = (await getSetting('customHotwordThemes', [])) as unknown
      const activeRaw = (await getSetting('customThemeActive', {})) as Record<string, boolean>
      const themes = Array.isArray(themesRaw) ? themesRaw : []
      const activeMap = activeRaw && typeof activeRaw === 'object' ? activeRaw : {}

      const id = `ai_gen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
      const newTheme = {
        id,
        name: finalName,
        words: Array.from(new Set(generatedWords.map((w) => w.trim()).filter(Boolean))),
      }
      const nextThemes = [newTheme, ...themes]
      const nextActive = { ...activeMap, [id]: true }

      await Promise.all([
        setSetting('customHotwordThemes', nextThemes),
        setSetting('customThemeActive', nextActive),
      ])
      setThemeSaved(true)
    } catch (e) {
      setGenError('保存失败：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const removeGeneratedWord = (w: string) => {
    setGeneratedWords(generatedWords.filter((x) => x !== w))
  }

  const renderStep = () => {
    switch (step) {
      // Step 0: 欢迎
      case 0:
        return (
          <div className="flex flex-col items-center text-center">
            <img src={appIcon} alt="SayDone" className="mb-6 h-20 w-20 rounded-2xl" />
            <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800 }}>欢迎使用 SayDone</h1>
            <p className="mt-3 text-base text-muted-foreground">语音输入，AI 润色</p>
            <p className="mt-1.5 text-sm text-muted-foreground/70">按一下开始说话，再按一下完成输入</p>
          </div>
        )

      // Step 1: 核心功能
      case 1:
        return (
          <div>
            <h2 className="mb-5 text-center text-xl font-bold">核心功能</h2>
            <div className="space-y-3">
              {[
                { icon: Mic, title: '免提语音输入', desc: '按一下开始说话，再按一下停止，文字自动输入到光标位置', color: 'text-blue-500 bg-blue-500/10' },
                { icon: Sparkles, title: 'AI 智能润色', desc: '口语自动转书面语，支持自定义 Prompt，完全掌控 AI 行为', color: 'text-amber-500 bg-amber-500/10' },
                { icon: Globe, title: '灵活部署', desc: '支持服务器、云 API、本地三种模式，按需选择，数据流向透明可控', color: 'text-emerald-500 bg-emerald-500/10' },
              ].map(({ icon: Icon, title, desc, color }) => (
                <Card key={title}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )

      // Step 2: 热键确认
      case 2:
        return (
          <div className="flex flex-col items-center text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Keyboard className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-xl font-bold">设置免提热键</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {keyConfirmed
                ? '热键已确认，你可以继续下一步'
                : <>默认热键为 <span className="font-medium text-foreground">右 Alt</span>，按下即可确认；也可以按其他按键更换</>}
            </p>

            {/* 大号按键展示 */}
            <div className="my-6">
              <div
                className={`inline-flex items-center justify-center rounded-xl border-2 px-8 py-4 text-lg font-bold transition-all ${
                  keyPressed
                    ? 'border-foreground bg-foreground text-background scale-105 shadow-xl'
                    : keyConfirmed
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600'
                      : 'border-primary/40 bg-primary/5 text-primary animate-pulse'
                }`}
              >
                {keyPressed ? `${hfLabel} ⬇` : keyConfirmed ? `✓ ${hfLabel}` : hfLabel}
              </div>
            </div>

            {/* 键盘位置示意 */}
            <div className="w-full rounded-xl border bg-card p-3">
              <p className="mb-2 text-[11px] text-muted-foreground">按键位置</p>
              <KeyboardHint activeKey={hfKey} pressed={keyPressed} />
            </div>

            {!keyConfirmed && (
              <p className="mt-4 text-xs text-muted-foreground/60">
                支持的按键：左/右 Alt、左/右 Ctrl、左/右 Shift、空格、CapsLock、F1–F12
              </p>
            )}
            {keyConfirmed && (
              <p className="mt-4 text-xs text-muted-foreground">
                如需更换，直接按下其他按键即可
              </p>
            )}
          </div>
        )

      // Step 3: 试一试
      case 3:
        return (
          <div>
            <h2 className="mb-5 text-center text-xl font-bold">试一试</h2>

            <Card className="mb-4">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Keyboard className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">免提快捷键</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">点击右侧按钮修改</p>
                  </div>
                </div>
                <button
                  onClick={() => setListeningKey(true)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-all ${
                    listeningKey
                      ? 'border-primary bg-primary/10 text-primary animate-pulse'
                      : 'border-border bg-muted/50 text-foreground hover:border-primary/50'
                  }`}
                >
                  {listeningKey ? '按下新按键...' : hfLabel}
                </button>
              </CardContent>
            </Card>

            <Card className="mb-4">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium">当前模式</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{MODE_LABELS[workMode] || workMode}</p>
                </div>
                {workMode === 'server' && (
                  <div className="flex items-center gap-1.5">
                    {serverOk === null ? (
                      <span className="text-xs text-muted-foreground">检测中...</span>
                    ) : serverOk ? (
                      <><CheckCircle2 className="h-4 w-4 text-emerald-500" /><span className="text-xs text-emerald-600">已连接</span></>
                    ) : (
                      <><AlertCircle className="h-4 w-4 text-destructive" /><span className="text-xs text-destructive">未连接</span></>
                    )}
                  </div>
                )}
                {workMode !== 'server' && (
                  <span className="text-xs text-muted-foreground">需在设置中配置</span>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="mb-2 text-sm font-medium">{canTest ? '语音输入测试' : '语音测试'}</p>
                {canTest && (
                  <p className="mb-2 text-xs text-muted-foreground">按一下 {hfLabel} 开始说话，再按一下自动插入文本</p>
                )}
                <textarea
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  placeholder={canTest
                    ? `按 ${hfLabel} 开始说话，再按一次插入文本到这里...`
                    : '当前模式暂不支持在此测试。完成向导后，可在设置中配置语音引擎，然后在任意应用中使用。'}
                  className="w-full resize-none rounded-lg border border-input-border bg-input-bg p-3 text-sm leading-relaxed placeholder:text-muted-foreground/40 focus:border-input-focus-border focus:outline-none"
                  rows={4}
                  readOnly={!canTest}
                />
                {!canTest && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    提示：完成向导后，前往「语音引擎」或「AI 供应商」配置后即可在任何应用中按 {hfLabel} 使用
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )

      // Step 4: AI 生成热词
      case 4:
        return (
          <div>
            <h2 className="mb-2 text-center text-xl font-bold">
              <Sparkles className="mr-1.5 inline h-5 w-5 text-primary" />
              定制你的热词
            </h2>
            <p className="mb-5 text-center text-xs text-muted-foreground">
              选择你的角色与使用场景，AI 为你生成专属热词库（未配 AI 时使用本地推荐）
            </p>

            {/* 角色 */}
            <div className="mb-4">
              <p className="mb-2 text-sm font-medium">
                你的角色 <span className="text-xs text-muted-foreground">（{pickedRoles.length}/{MAX_PICKS_PER_CATEGORY}，多选）</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {ROLES.map((r) => {
                  const active = pickedRoles.includes(r.id)
                  const disabled = !active && pickedRoles.length >= MAX_PICKS_PER_CATEGORY
                  return (
                    <button
                      key={r.id}
                      onClick={() => togglePick(pickedRoles, setPickedRoles, r.id)}
                      disabled={disabled}
                      className={`rounded-full border px-3 py-1 text-xs transition-all ${
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : disabled
                            ? 'border-border bg-muted/30 text-muted-foreground/40 cursor-not-allowed'
                            : 'border-border bg-muted/50 text-foreground hover:border-primary/50'
                      }`}
                    >
                      <span className="mr-1">{r.icon}</span>
                      {r.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 场景 */}
            <div className="mb-4">
              <p className="mb-2 text-sm font-medium">
                使用场景 <span className="text-xs text-muted-foreground">（{pickedScenarios.length}/{MAX_PICKS_PER_CATEGORY}，多选）</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {SCENARIOS.map((s) => {
                  const active = pickedScenarios.includes(s.id)
                  const disabled = !active && pickedScenarios.length >= MAX_PICKS_PER_CATEGORY
                  return (
                    <button
                      key={s.id}
                      onClick={() => togglePick(pickedScenarios, setPickedScenarios, s.id)}
                      disabled={disabled}
                      className={`rounded-full border px-3 py-1 text-xs transition-all ${
                        active
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : disabled
                            ? 'border-border bg-muted/30 text-muted-foreground/40 cursor-not-allowed'
                            : 'border-border bg-muted/50 text-foreground hover:border-emerald-500/50'
                      }`}
                    >
                      <span className="mr-1">{s.icon}</span>
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 生成按钮 */}
            <button
              onClick={() => void handleGenerateHotwords()}
              disabled={pickedRoles.length === 0 || pickedScenarios.length === 0 || generating}
              className="mb-4 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  生成中…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {pickedRoles.length === 0 || pickedScenarios.length === 0
                    ? '请先选择角色和场景'
                    : 'AI 生成专属热词'}
                </>
              )}
            </button>

            {genError && (
              <p className="mb-3 text-xs text-destructive">{genError}</p>
            )}

            {/* 预览 */}
            {generatedWords.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium">
                      预览 · {generatedWords.length} 个热词
                    </p>
                    <span
                      className={`text-xs ${generatedSource === 'llm' ? 'text-emerald-600' : 'text-muted-foreground'}`}
                    >
                      {generatedSource === 'llm'
                        ? `AI 生成 · ${(generatedElapsed / 1000).toFixed(1)}s`
                        : '本地推荐词集'}
                    </span>
                  </div>
                  <div className="mb-3 max-h-40 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 leading-relaxed">
                    {generatedWords.map((w) => (
                      <span
                        key={w}
                        className="mr-1.5 mb-1.5 inline-flex items-center gap-1 rounded bg-background px-2 py-0.5 text-xs"
                      >
                        {w}
                        <button
                          onClick={() => removeGeneratedWord(w)}
                          className="text-muted-foreground/50 hover:text-destructive"
                          title="移除"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>

                  {!themeSaved ? (
                    <>
                      <input
                        value={themeName}
                        onChange={(e) => setThemeName(e.target.value)}
                        placeholder="主题名称"
                        className="mb-2 w-full rounded-md border border-input-border bg-input-bg px-3 py-1.5 text-sm focus:border-input-focus-border focus:outline-none"
                      />
                      <button
                        onClick={() => void handleSaveTheme()}
                        className="w-full rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500/90"
                      >
                        保存为热词主题
                      </button>
                    </>
                  ) : (
                    <p className="text-center text-xs text-emerald-600">
                      <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                      已保存，可在「热词」页管理
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {generatedWords.length === 0 && !generating && (
              <p className="text-center text-xs text-muted-foreground/70">
                不想配？可直接「下一步」跳过，之后在「热词」页手动添加
              </p>
            )}
          </div>
        )

      // Step 5: 完成
      case 5:
        return (
          <div className="flex flex-col items-center text-center">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold">准备就绪</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              在任何应用中按 <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-medium text-foreground">{hfLabel}</span> 开始说话
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground/70">再按一次停止，文字自动输入到光标位置</p>
            {themeSaved && (
              <p className="mt-4 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-600">
                <Sparkles className="h-3 w-3" />
                AI 热词已为你准备就绪
              </p>
            )}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="custom-scrollbar w-full max-w-lg max-h-[90vh] overflow-y-auto px-6 py-8">
        {renderStep()}

        {/* 底部导航 */}
        <div className="mt-8 flex items-center justify-between">
          <div className="flex gap-1.5">
            {Array.from({ length: totalSteps }, (_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/20'
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-1 rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                上一步
              </button>
            )}
            {!isLast && step === 0 && (
              <button
                onClick={onComplete}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                跳过
              </button>
            )}
            <button
              onClick={() => isLast ? onComplete() : setStep(step + 1)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {isLast ? '开始使用' : '下一步'}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
