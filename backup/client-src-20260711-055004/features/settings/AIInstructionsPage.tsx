import { useEffect, useState } from 'react'
import { BUILTIN_APP_RULES } from '@/services/personalization/defaults'
import {
  getAppPromptRules,
  saveAppPromptRules,
} from '@/services/personalization/store'
import type { AppPromptRule } from '@/services/personalization/types'
import { refreshPreset, refreshRecorderSettings } from '@/services/recorder'
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
import AIProofreadToggle from './AIProofreadToggle'
import AppPromptRulesSection from './AppPromptRulesSection'
import PromptPresetSection from './PromptPresetSection'
import KnowledgeBaseToggle from './KnowledgeBaseToggle'

export default function AIInstructionsPage() {
  const [presets, setPresets] = useState<PromptPreset[]>([])
  const [activeProofreadPresetId, setActiveProofreadId] = useState('intent')
  const [activeChatPresetId, setActiveChatId] = useState('chat_writer')
  const [editingPreset, setEditingPreset] = useState<PromptPreset | null>(null)
  const [appPromptRules, setAppPromptRules] = useState<AppPromptRule[]>([])

  useEffect(() => {
    void (async () => {
      const [loadedPresets, loadedProofreadId, loadedChatId, loadedRules] = await Promise.all([
        getPromptPresets(),
        getActivePresetId(),
        getActiveChatPresetId(),
        getAppPromptRules(),
      ])
      setPresets(loadedPresets)
      setActiveProofreadId(loadedProofreadId)
      setActiveChatId(loadedChatId)
      setAppPromptRules(loadedRules)
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

  const handleSaveAppRule = async (rule: AppPromptRule) => {
    const nextRules = appPromptRules
      .map((item) => (item.id === rule.id ? rule : item))
      .sort((left, right) => right.priority - left.priority)
    setAppPromptRules(nextRules)
    await saveAppPromptRules(nextRules)
    await refreshRecorderSettings()
  }

  const handleResetAppRule = async (ruleId: string) => {
    const fallback = BUILTIN_APP_RULES.find((rule) => rule.id === ruleId)
    if (!fallback) return
    const nextRules = appPromptRules
      .map((rule) => (rule.id === ruleId ? { ...fallback, matcher: { ...fallback.matcher } } : rule))
      .sort((left, right) => right.priority - left.priority)
    setAppPromptRules(nextRules)
    await saveAppPromptRules(nextRules)
    await refreshRecorderSettings()
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-2 text-2xl font-bold">AI 整理</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        配置 AI 如何整理识别出的文字（校对开关、提示词预设、按应用的规则）。选择使用哪家 AI，请前往「AI 供应商」。
      </p>

      <div className="space-y-6">
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

        <AppPromptRulesSection
          presets={presets}
          rules={appPromptRules}
          onSaveRule={handleSaveAppRule}
          onResetRule={handleResetAppRule}
        />

        <KnowledgeBaseToggle />
      </div>
    </div>
  )
}
