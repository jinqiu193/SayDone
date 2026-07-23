import { useEffect, useState } from 'react'
import { Code2, Edit3, FileText, Mail, MessageCircle, Sparkles, Type } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  deletePromptPreset,
  getActiveChatPresetId,
  getActivePresetId,
  getPromptPresets,
  savePromptPreset,
  setActiveChatPresetId,
  setActivePresetId,
  type PromptPreset,
  type PromptPresetMode,
} from '@/services/store'
import { refreshPreset } from '@/services/recorder'
import {
  POLISH_STYLE_META,
  type PolishStyleId,
} from '@/services/recorder/helpers'
import { useAppScenario } from '@/features/appScenarios/AppScenarioContext'
import AIProofreadToggle from './AIProofreadToggle'
import PromptPresetSection from './PromptPresetSection'
import KnowledgeBaseToggle from './KnowledgeBaseToggle'
import TavilySearchToggle from './TavilySearchToggle'

const RULE_ICONS = {
  'message-circle': MessageCircle,
  type: Type,
  mail: Mail,
  'file-text': FileText,
  'code-2': Code2,
  'edit-3': Edit3,
  sparkles: Sparkles,
} as const

const BUILTIN_RULES = [
  { style: 'code' as PolishStyleId, examples: ['Code.exe', 'Cursor', 'IntelliJ IDEA', 'VS', 'Xcode', 'Windows Terminal'], desc: '保留英文变量名 / 命令 / 技术名词，不强行翻译' },
  { style: 'email' as PolishStyleId, examples: ['Outlook', 'Foxmail', 'Thunderbird', '邮箱大师'], desc: '敬语开头 + 段落规范 + 自动落款' },
  { style: 'note' as PolishStyleId, examples: ['Notion', 'Obsidian', 'Typora', 'Logseq', '语雀'], desc: '结构化输出 (Markdown 标题 / 列表)' },
  { style: 'formal' as PolishStyleId, examples: ['Word', 'Excel', 'PowerPoint', 'Pages', 'WPS'], desc: '严谨书面，逗号句号齐全，避免口语化用词' },
  { style: 'casual' as PolishStyleId, examples: ['微信', 'QQ', '钉钉', '飞书', 'Slack', 'Discord', 'Telegram'], desc: '自然口语风，去掉一切书面语修饰' },
]

export default function AIInstructionsPage() {
  const [presets, setPresets] = useState<PromptPreset[]>([])
  const [activeProofreadPresetId, setActiveProofreadId] = useState('intent')
  const [activeChatPresetId, setActiveChatId] = useState('chat_writer')
  const [editingPreset, setEditingPreset] = useState<PromptPreset | null>(null)
  const { meta, autoDetectionEnabled, enabledRuleIds, setAutoDetectionEnabled, setEnabledRules } = useAppScenario()

  useEffect(() => {
    void (async () => {
      const [loadedPresets, loadedProofreadId, loadedChatId] = await Promise.all([
        getPromptPresets(),
        getActivePresetId(),
        getActiveChatPresetId(),
      ])
      setPresets(loadedPresets)
      setActiveProofreadId(loadedProofreadId)
      setActiveChatId(loadedChatId)
    })()
  }, [])

  const handleSelectProofreadPreset = async (id: string) => {
    setActiveProofreadId(id)
    await setActivePresetId(id)
    await refreshPreset()
  }

  const handleSelectChatPreset = async (id: string) => {
    setActiveChatId(id)
    await setActiveChatPresetId(id)
    await refreshPreset()
  }

  const handleSavePreset = async (preset: PromptPreset) => {
    await savePromptPreset(preset)
    setPresets(await getPromptPresets())
    setEditingPreset(null)
    if (preset.id === activeProofreadPresetId || preset.id === activeChatPresetId) {
      await refreshPreset()
    }
  }

  const handleDeletePreset = async (id: string) => {
    await deletePromptPreset(id)
    setPresets(await getPromptPresets())
    // deletePromptPreset 内部会按 mode 字段重置对应的活跃槽位；
    // 这里同步前端 state，并刷新缓存。
    if (id === activeProofreadPresetId) {
      setActiveProofreadId('intent')
      await refreshPreset()
    }
    if (id === activeChatPresetId) {
      setActiveChatId('chat_writer')
      await refreshPreset()
    }
  }

  const handleNewPreset = (mode: PromptPresetMode) => {
    setEditingPreset({
      id: Date.now().toString(36),
      name: '',
      systemPrompt: '',
      mode,
    })
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-2 text-2xl font-bold">AI 整理</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        配置 AI 如何整理识别出的文字（校对开关、提示词预设、按应用的规则）。选择使用哪家 AI，请前往「AI 供应商」。
      </p>

      <div className="space-y-6">
        {/* 自动识别规则 */}
        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">自动识别规则</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  根据焦点应用自动选择 AI 润色风格
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">总开关</span>
                <Switch
                  checked={autoDetectionEnabled}
                  onChange={() => { void setAutoDetectionEnabled(!autoDetectionEnabled) }}
                />
              </div>
            </div>
            <div className="space-y-2">
              {BUILTIN_RULES.map((rule) => {
                const ruleMeta = meta[rule.style]
                const Icon = RULE_ICONS[ruleMeta.icon]
                const isEnabled = enabledRuleIds.includes(rule.style)
                return (
                  <div
                    key={rule.style}
                    className="flex items-center gap-3 rounded-lg bg-surface-2 px-4 py-3"
                  >
                    <Switch
                      checked={isEnabled}
                      onChange={() => {
                        if (isEnabled) {
                          void setEnabledRules(enabledRuleIds.filter(id => id !== rule.style))
                        } else {
                          void setEnabledRules([...enabledRuleIds, rule.style])
                        }
                      }}
                    />
                    <div className="rounded-md bg-primary/10 p-2 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{ruleMeta.label}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{rule.desc}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {rule.examples.map((ex) => (
                          <span
                            key={ex}
                            className="rounded-full bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground border border-border/40"
                          >
                            {ex}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 rounded-md bg-info/10 px-3 py-2 text-xs text-muted-foreground">
              <Sparkles className="mr-1 inline h-3 w-3" />
              {meta.auto.desc} · 未在以上列表中的应用会保持「自动」状态，不会被强制应用任何风格。
            </div>
          </CardContent>
        </Card>

        <AIProofreadToggle />

        <PromptPresetSection
          mode="proofread"
          presets={presets}
          activePresetId={activeProofreadPresetId}
          editingPreset={editingPreset}
          onSelectPreset={handleSelectProofreadPreset}
          onStartNewPreset={handleNewPreset}
          onStartEditing={setEditingPreset}
          onEditingPresetChange={setEditingPreset}
          onCancelEditing={() => setEditingPreset(null)}
          onSavePreset={handleSavePreset}
          onDeletePreset={handleDeletePreset}
        />

        <PromptPresetSection
          mode="chat"
          presets={presets}
          activePresetId={activeChatPresetId}
          editingPreset={editingPreset}
          onSelectPreset={handleSelectChatPreset}
          onStartNewPreset={handleNewPreset}
          onStartEditing={setEditingPreset}
          onEditingPresetChange={setEditingPreset}
          onCancelEditing={() => setEditingPreset(null)}
          onSavePreset={handleSavePreset}
          onDeletePreset={handleDeletePreset}
        />

        <KnowledgeBaseToggle />

        <TavilySearchToggle />
      </div>
    </div>
  )
}
