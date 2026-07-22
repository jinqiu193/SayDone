import { useState } from 'react'
import { Plus, X, Search, RotateCcw, ChevronDown, ChevronUp, FolderPlus, Trash2, Download, Sparkles, Loader2, Wand2, Edit3 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/card'
import { Page } from '@/components/ui/Page'
import { PageHeader } from '@/components/ui/PageHeader'
import { Tabs } from '@/components/ui/Tabs'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { Switch } from '@/components/ui/switch'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { exportHotwords } from '@/services/exports'
import { BUILTIN_SETS, MAX_HOTWORDS } from '@/services/hotwords/model'
import { useHotwordsManager } from '@/services/hotwords/useHotwordsManager'
import { getSetting, setSetting } from '@/services/store'
import * as bridge from '@/services/bridge'
import { ROLES, SCENARIOS, MAX_PICKS_PER_CATEGORY, defaultThemeName } from '@/services/hotwords/roles'
import TextReplacementSection from '@/components/TextReplacementSection'

type Tab = 'hotwords' | 'replacement'

export default function Dictionary() {
  const [tab, setTab] = useState<Tab>('hotwords')
  const [exportMessage, setExportMessage] = useState('')
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [pickedRoles, setPickedRoles] = useState<string[]>([])
  const [pickedScenarios, setPickedScenarios] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [generatedWords, setGeneratedWords] = useState<string[]>([])
  const [generatedSource, setGeneratedSource] = useState<string>('')
  const [genError, setGenError] = useState<string | null>(null)
  const [themeName, setThemeName] = useState<string>('')
  const [themeSaved, setThemeSaved] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null)
  const [editingThemeName, setEditingThemeName] = useState('')
  const [editingThemeWords, setEditingThemeWords] = useState('')
  const [addingNewTheme, setAddingNewTheme] = useState(false)
  const [newThemeName2, setNewThemeName2] = useState('')
  const [newThemeWords, setNewThemeWords] = useState('')
  const {
    hotwords,
    builtinSetWords,
    builtinSetActive,
    customThemes,
    customThemeActive,
    themeInputs,
    newThemeName,
    search,
    loading,
    showUnknown,
    filtered,
    filteredUnknown,
    visibleCustomThemes,
    getSetWordsInHotwords,
    setNewThemeName,
    setSearch,
    setShowUnknown,
    setThemeInput,
    addTheme,
    addWordsToTheme,
    removeTheme,
    toggleCustomTheme,
    removeWord,
    toggleBuiltinSet,
    resetBuiltinSet,
    reloadHotwords,
  } = useHotwordsManager()

  const handleExport = async () => {
    const result = await exportHotwords()
    setExportMessage(result.canceled ? '已取消导出。' : `已保存到 ${result.filePath}`)
  }

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
    setThemeSaved(false)
    try {
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
      if (!themeName.trim()) {
        setThemeName(defaultThemeName(pickedRoles, pickedScenarios))
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  const handleSaveAiTheme = async () => {
    if (generatedWords.length === 0) return
    const finalName = themeName.trim() || defaultThemeName(pickedRoles, pickedScenarios)
    try {
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
      await reloadHotwords()
      setGeneratedWords([])
      setPickedRoles([])
      setPickedScenarios([])
      setThemeName('')
      setShowAiPanel(false)
    } catch (e) {
      setGenError('保存失败：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const removeGeneratedWord = (w: string) => {
    setGeneratedWords(generatedWords.filter((x) => x !== w))
  }

  const startEditTheme = (theme: typeof visibleCustomThemes[0]) => {
    setEditingThemeId(theme.id)
    setEditingThemeName(theme.name)
    setEditingThemeWords(theme.words.join(', '))
  }

  const cancelEditTheme = () => {
    setEditingThemeId(null)
    setEditingThemeName('')
    setEditingThemeWords('')
  }

  const saveEditTheme = async () => {
    if (!editingThemeId || !editingThemeName.trim()) return
    try {
      const themesRaw = (await getSetting('customHotwordThemes', [])) as unknown
      const themes = Array.isArray(themesRaw) ? themesRaw as typeof visibleCustomThemes : []
      const words = editingThemeWords.split(/[,，\n]+/).map(w => w.trim()).filter(Boolean)
      const nextThemes = themes.map((t) =>
        t.id === editingThemeId ? { ...t, name: editingThemeName.trim(), words } : t
      )
      await setSetting('customHotwordThemes', nextThemes)
      await reloadHotwords()
      cancelEditTheme()
    } catch (e) {
      setGenError('保存失败：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const addWordToTheme = async (themeId: string, newWord: string) => {
    if (!newWord.trim()) return
    try {
      const themesRaw = (await getSetting('customHotwordThemes', [])) as unknown
      const themes = Array.isArray(themesRaw) ? themesRaw as typeof visibleCustomThemes : []
      const nextThemes = themes.map((t) =>
        t.id === themeId ? { ...t, words: [...new Set([...t.words, newWord.trim()])] } : t
      )
      await setSetting('customHotwordThemes', nextThemes)
      await reloadHotwords()
    } catch (e) {
      setGenError('添加失败：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const removeWordFromTheme = async (themeId: string, word: string) => {
    try {
      const themesRaw = (await getSetting('customHotwordThemes', [])) as unknown
      const themes = Array.isArray(themesRaw) ? themesRaw as typeof visibleCustomThemes : []
      const nextThemes = themes.map((t) =>
        t.id === themeId ? { ...t, words: t.words.filter(w => w !== word) } : t
      )
      await setSetting('customHotwordThemes', nextThemes)
      await reloadHotwords()
    } catch (e) {
      setGenError('删除失败：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const saveNewTheme = async () => {
    if (!newThemeName2.trim()) return
    try {
      const themesRaw = (await getSetting('customHotwordThemes', [])) as unknown
      const activeRaw = (await getSetting('customThemeActive', {})) as Record<string, boolean>
      const themes = Array.isArray(themesRaw) ? themesRaw as typeof visibleCustomThemes : []
      const activeMap = activeRaw && typeof activeRaw === 'object' ? activeRaw : {}

      const words = newThemeWords.split(/[,，\n]+/).map(w => w.trim()).filter(Boolean)
      const id = `manual_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
      const newTheme = { id, name: newThemeName2.trim(), words }

      await Promise.all([
        setSetting('customHotwordThemes', [newTheme, ...themes]),
        setSetting('customThemeActive', { ...activeMap, [id]: true }),
      ])
      await reloadHotwords()
      setAddingNewTheme(false)
      setNewThemeName2('')
      setNewThemeWords('')
    } catch (e) {
      setGenError('保存失败：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  return (
    <Page>
      <PageHeader
        title="词林"
        description="AI 生成专属热词，识别更精准。"
        action={
          tab === 'hotwords' ? (
            <>
              <span className="text-sm tabular-nums text-muted-foreground">
                {hotwords.length} / {MAX_HOTWORDS}
              </span>
              <Tooltip content="导出数据">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                  onClick={() => void handleExport()}
                  aria-label="导出数据"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </Tooltip>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索"
                leftIcon={Search}
                className="w-48"
              />
            </>
          ) : null
        }
      />

      <Tabs
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        ariaLabel="词典视图切换"
        items={[
          { value: 'hotwords', label: '热词' },
          { value: 'replacement', label: '文本替换' },
        ]}
        className="mb-6"
      />

      {exportMessage && tab === 'hotwords' && (
        <p className="mb-3 text-sm text-muted-foreground">{exportMessage}</p>
      )}

      {tab === 'replacement' && <TextReplacementSection />}

      {tab === 'hotwords' && (
        <>
          {/* AI 生成热词 - 主要入口 */}
          <Card className="mb-6 border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">AI 生成热词</h2>
                    <p className="text-sm text-muted-foreground">选择角色和场景，AI 为你生成专属热词库</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setShowAiPanel(!showAiPanel)}
                    variant="outline"
                    className="gap-2"
                  >
                    <Wand2 className="h-4 w-4" />
                    {showAiPanel ? '收起' : '开始生成'}
                  </Button>
                </div>
              </div>

              {/* 展开的 AI 生成选项 */}
              {showAiPanel && (
                <div className="mt-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    {/* 角色选择 */}
                    <div>
                      <p className="mb-3 text-sm font-medium">
                        你的角色 <span className="text-muted-foreground">（{pickedRoles.length}/{MAX_PICKS_PER_CATEGORY}，可多选）</span>
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
                              className={cn(
                                'rounded-full px-3 py-1.5 text-sm transition-all',
                                active
                                  ? 'bg-primary text-primary-foreground'
                                  : disabled
                                    ? 'bg-muted/30 text-muted-foreground/40 cursor-not-allowed'
                                    : 'bg-secondary hover:bg-secondary/80'
                              )}
                            >
                              <span className="mr-1">{r.icon}</span>
                              {r.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* 场景选择 */}
                    <div>
                      <p className="mb-3 text-sm font-medium">
                        使用场景 <span className="text-muted-foreground">（{pickedScenarios.length}/{MAX_PICKS_PER_CATEGORY}，可多选）</span>
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
                              className={cn(
                                'rounded-full border px-3 py-1.5 text-sm transition-all',
                                active
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : disabled
                                    ? 'border-muted/30 bg-muted/30 text-muted-foreground/40 cursor-not-allowed'
                                    : 'border-border bg-secondary hover:border-primary/50'
                              )}
                            >
                              <span className="mr-1">{s.icon}</span>
                              {s.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* 生成按钮 */}
                  <div className="mt-6 flex items-center gap-4">
                    <Button
                      onClick={() => void handleGenerateHotwords()}
                      disabled={pickedRoles.length === 0 || pickedScenarios.length === 0 || generating}
                      className="gap-2 px-6"
                      size="lg"
                    >
                      {generating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          AI 生成中…
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          {pickedRoles.length === 0 || pickedScenarios.length === 0
                            ? '请先选择角色和场景'
                            : '生成专属热词'}
                        </>
                      )}
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      基于你的选择生成 {pickedRoles.length * pickedScenarios.length} 组关键词
                    </span>
                  </div>

                  {genError && (
                    <p className="mt-3 text-sm text-destructive">{genError}</p>
                  )}

                  {/* 预览 */}
                  {generatedWords.length > 0 && (
                    <div className="mt-6 rounded-lg bg-background/80 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-medium">
                          生成结果 · {generatedWords.length} 个热词
                        </p>
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded-full',
                          generatedSource === 'llm' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                        )}>
                          {generatedSource === 'llm' ? 'AI 生成' : '本地推荐'}
                        </span>
                      </div>
                      <div className="mb-4 max-h-40 overflow-y-auto">
                        <div className="flex flex-wrap gap-2">
                          {generatedWords.map((w) => (
                            <span
                              key={w}
                              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs"
                            >
                              {w}
                              <button
                                onClick={() => removeGeneratedWord(w)}
                                className="text-muted-foreground/50 hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                      {!themeSaved ? (
                        <div className="flex items-center gap-3">
                          <Input
                            value={themeName}
                            onChange={(e) => setThemeName(e.target.value)}
                            placeholder="输入主题名称保存"
                            className="flex-1"
                          />
                          <Button
                            onClick={() => void handleSaveAiTheme()}
                            className="gap-2"
                          >
                            <Sparkles className="h-4 w-4" />
                            保存主题
                          </Button>
                        </div>
                      ) : (
                        <p className="text-center text-sm text-success">✓ 已保存到热词列表</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI 生成的主题列表 */}
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">已保存的热词主题</h3>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setAddingNewTheme(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                新增主题
              </Button>
            </div>

            {/* 新增主题表单 */}
            {addingNewTheme && (
              <Card className="mb-4 border-primary/30 bg-primary/5">
                <CardContent className="p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-medium">新增热词主题</span>
                    <button
                      onClick={() => {
                        setAddingNewTheme(false)
                        setNewThemeName2('')
                        setNewThemeWords('')
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <Input
                    value={newThemeName2}
                    onChange={(e) => setNewThemeName2(e.target.value)}
                    placeholder="主题名称"
                    className="mb-2"
                  />
                  <textarea
                    value={newThemeWords}
                    onChange={(e) => setNewThemeWords(e.target.value)}
                    placeholder="热词（逗号、换行分隔）"
                    className="mb-3 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    rows={3}
                  />
                  <Button size="sm" onClick={() => void saveNewTheme()} className="gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    保存主题
                  </Button>
                </CardContent>
              </Card>
            )}

            {visibleCustomThemes.length === 0 && !addingNewTheme ? (
              <p className="text-sm text-muted-foreground">暂无热词主题，使用上方 AI 生成或点击「新增主题」创建</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
                {visibleCustomThemes.map((theme) => {
                  const active = !!customThemeActive[theme.id]
                  const isAiGenerated = theme.id.startsWith('ai_gen_')
                  const isEditing = editingThemeId === theme.id

                  return (
                    <Card key={theme.id} className={cn(!active && 'opacity-60')}>
                      <CardContent className="p-4">
                        {isEditing ? (
                          <div>
                            <div className="mb-3 flex items-center justify-between">
                              <span className="text-sm font-medium">编辑热词主题</span>
                              <button
                                onClick={cancelEditTheme}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <Input
                              value={editingThemeName}
                              onChange={(e) => setEditingThemeName(e.target.value)}
                              placeholder="主题名称"
                              className="mb-2"
                            />
                            <textarea
                              value={editingThemeWords}
                              onChange={(e) => setEditingThemeWords(e.target.value)}
                              placeholder="热词（逗号、换行分隔）"
                              className="mb-3 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                              rows={4}
                            />
                            <Button size="sm" onClick={() => void saveEditTheme()} className="gap-1.5">
                              <Sparkles className="h-3.5 w-3.5" />
                              保存
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="mb-2 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={active}
                                  onChange={() => void toggleCustomTheme(theme.id)}
                                  size="sm"
                                />
                                <span className="text-sm font-medium">{theme.name}</span>
                                {isAiGenerated && (
                                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => startEditTheme(theme)}
                                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => void removeTheme(theme.id)}
                                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                            <p className="mb-2 text-xs text-muted-foreground">
                              {theme.words.length} 个热词
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {theme.words.map((w) => (
                                <span
                                  key={w}
                                  className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs"
                                >
                                  {w}
                                  <button
                                    onClick={() => void removeWordFromTheme(theme.id, w)}
                                    className="text-muted-foreground/50 hover:text-destructive"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>

          {/* 高级设置折叠区域 */}
          <div className="border-t pt-6">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <Edit3 className="h-4 w-4" />
              {showAdvanced ? '收起' : '手动添加 / 内置词库'}
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showAdvanced && (
              <div className="space-y-4">
                {/* 新建热词分类 */}
                <div className="flex items-center gap-2">
                  <FolderPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Input
                    value={newThemeName}
                    onChange={(e) => setNewThemeName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void addTheme()
                      }
                    }}
                    placeholder="新建分类，例如：项目A / 医疗术语"
                    className="flex-1"
                  />
                  <Button
                    onClick={() => void addTheme()}
                    size="sm"
                    variant="outline"
                    disabled={!newThemeName.trim()}
                    className="shrink-0 gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    添加
                  </Button>
                </div>

                {/* 内置分类 */}
                {Object.entries(BUILTIN_SETS).map(([key, setDef]) => {
                  const active = !!builtinSetActive[key]
                  const activeWords = getSetWordsInHotwords(key)
                  const totalWords = (builtinSetWords[key] || []).length

                  if (search && activeWords.length === 0 && !setDef.label.toLowerCase().includes(search.toLowerCase())) {
                    return null
                  }

                  return (
                    <Card key={key} className={cn(!active && 'opacity-60')}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <Switch
                              checked={active}
                              onChange={() => void toggleBuiltinSet(key)}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{setDef.label}</p>
                              <p className="text-xs text-muted-foreground">
                                {setDef.description} · {activeWords.length} / {totalWords} 词
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 px-2 text-xs"
                            onClick={() => void resetBuiltinSet(key)}
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        </div>

                        {active && activeWords.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {activeWords.map((word) => (
                              <span
                                key={word}
                                className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs text-foreground/90"
                              >
                                {word}
                                <button
                                  onClick={() => void removeWord(word)}
                                  className="rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive"
                                >
                                  <X className="h-2.5 w-2.5 text-muted-foreground" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}

                {/* 历史未分类词汇 */}
                {filteredUnknown.length > 0 && (
                  <Card>
                    <CardContent className="p-4">
                      <button
                        className="flex w-full items-center justify-between text-left"
                        onClick={() => setShowUnknown(!showUnknown)}
                      >
                        <div>
                          <p className="text-sm font-medium">历史未分类词汇</p>
                          <p className="text-xs text-muted-foreground">
                            来自历史数据，不计入热词分类
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{filteredUnknown.length}</span>
                          {showUnknown ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </button>

                      {showUnknown && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {filteredUnknown.map((word) => (
                            <span
                              key={word}
                              className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs text-foreground/90"
                            >
                              {word}
                              <button
                                onClick={() => void removeWord(word)}
                                className="rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive"
                              >
                                <X className="h-2.5 w-2.5 text-muted-foreground" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>

          {!search && hotwords.length === 0 && (
            <EmptyState
              title="还没有词汇"
              description="使用上方的 AI 生成功能，快速创建专属热词库。"
            />
          )}

          {search && filtered.length === 0 && (
            <EmptyState title="没有匹配的热词" description={`"${search}" 没找到相关词条`} />
          )}
        </>
      )}
    </Page>
  )
}
