import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
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
import AIProofreadToggle from './AIProofreadToggle'
import PromptPresetSection from './PromptPresetSection'
import KnowledgeBaseToggle from './KnowledgeBaseToggle'
import TavilySearchToggle from './TavilySearchToggle'

export default function AIInstructionsPage() {
  const [presets, setPresets] = useState<PromptPreset[]>([])
  const [activeProofreadPresetId, setActiveProofreadId] = useState('intent')
  const [activeChatPresetId, setActiveChatId] = useState('chat_writer')
  const [editingPreset, setEditingPreset] = useState<PromptPreset | null>(null)

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
