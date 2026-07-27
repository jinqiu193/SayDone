import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, Save, X, FileText, ToggleLeft, ToggleRight, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Page } from '@/components/ui/Page'
import { PageHeader } from '@/components/ui/PageHeader'
import { cn } from '@/lib/utils'
import { getTemplates, addTemplate, updateTemplate, deleteTemplate, getTemplateThreshold, setTemplateThreshold, getTemplateMatchEnabled, setTemplateMatchEnabled, resetTemplates } from '@/services/templates/store'
import type { DocumentTemplate } from '@/services/templates/types'

export default function TemplatesPage() {
  const [templates, setTemplatesState] = useState<DocumentTemplate[]>([])
  const [threshold, setThresholdState] = useState(0.6)
  const [enabled, setEnabledState] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<DocumentTemplate>>({})
  const [isCreating, setIsCreating] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void loadData()
  }, [])

  const loadData = async () => {
    try {
      const [tmpl, thresh, en] = await Promise.all([
        getTemplates(),
        getTemplateThreshold(),
        getTemplateMatchEnabled(),
      ])
      setTemplatesState(tmpl)
      setThresholdState(thresh)
      setEnabledState(en)
    } catch (e) {
      console.error('Failed to load templates:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleEnabled = async () => {
    const newEnabled = !enabled
    setEnabledState(newEnabled)
    await setTemplateMatchEnabled(newEnabled)
  }

  const handleThresholdChange = async (value: number) => {
    setThresholdState(value)
    await setTemplateThreshold(value)
  }

  const handleToggleTemplate = async (template: DocumentTemplate) => {
    const updated = { ...template, enabled: !template.enabled }
    await updateTemplate(template.id, updated)
    setTemplatesState((prev) => prev.map((t) => (t.id === template.id ? updated : t)))
  }

  const handleEdit = (template: DocumentTemplate) => {
    setEditingId(template.id)
    setEditForm({ ...template })
    setIsCreating(false)
  }

  const handleCreate = () => {
    const newTemplate: Partial<DocumentTemplate> = {
      id: `custom_${Date.now()}`,
      name: '',
      triggerKeywords: [],
      content: '',
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setEditForm(newTemplate)
    setEditingId(null)
    setIsCreating(true)
  }

  const handleSave = async () => {
    if (!editForm.name?.trim()) {
      alert('请输入模板名称')
      return
    }
    if (!editForm.triggerKeywords || editForm.triggerKeywords.length === 0) {
      alert('请输入至少一个触发关键词')
      return
    }
    if (!editForm.content?.trim()) {
      alert('请输入模板内容')
      return
    }

    const template: DocumentTemplate = {
      id: editForm.id || `custom_${Date.now()}`,
      name: editForm.name.trim(),
      triggerKeywords: editForm.triggerKeywords.filter(Boolean),
      content: editForm.content,
      enabled: editForm.enabled ?? true,
      createdAt: editForm.createdAt || Date.now(),
      updatedAt: Date.now(),
    }

    if (isCreating) {
      await addTemplate(template)
      setTemplatesState((prev) => [...prev, template])
    } else if (editingId) {
      await updateTemplate(editingId, template)
      setTemplatesState((prev) => prev.map((t) => (t.id === editingId ? template : t)))
    }

    setEditingId(null)
    setIsCreating(false)
    setEditForm({})
  }

  const handleCancel = () => {
    setEditingId(null)
    setIsCreating(false)
    setEditForm({})
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个模板吗？')) return
    await deleteTemplate(id)
    setTemplatesState((prev) => prev.filter((t) => t.id !== id))
  }

  const handleReset = async () => {
    if (!confirm('确定要重置为默认模板吗？所有自定义模板将被删除。')) return
    await resetTemplates()
    await loadData()
  }

  const handleKeywordsChange = (value: string) => {
    const keywords = value.split(',').map((k) => k.trim()).filter(Boolean)
    setEditForm((prev) => ({ ...prev, triggerKeywords: keywords }))
  }

  if (loading) {
    return (
      <Page>
        <div className="flex h-full items-center justify-center">
          <div className="text-muted-foreground">加载中...</div>
        </div>
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        title="文档模板"
        description="按住 Ctrl 说话时，根据内容匹配模板并生成文档。模板匹配使用 RAG 向量相似度搜索。"
        action={
          <FileText className="h-6 w-6 text-primary" />
        }
      />

      <div className="mb-6 rounded-2xl bg-card p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">模板匹配</div>
            <div className="mt-1 text-xs text-muted-foreground">
              共 {templates.filter((t) => t.enabled).length} 个启用的模板 · 当前阈值 {Math.round(threshold * 100)}%
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              onClick={handleToggleEnabled}
              className={cn(
                enabled ? 'bg-green-500/10 text-green-600 hover:bg-green-500/20' : 'bg-muted text-muted-foreground'
              )}
            >
              {enabled ? <ToggleRight className="mr-2 h-4 w-4" /> : <ToggleLeft className="mr-2 h-4 w-4" />}
              {enabled ? '已开启' : '已关闭'}
            </Button>
            <Button variant="outline" onClick={() => void handleReset()}>
              <RotateCcw className="mr-2 h-4 w-4" />
              重置
            </Button>
            <Button onClick={() => void handleCreate()}>
              <Plus className="mr-2 h-4 w-4" />
              新建模板
            </Button>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium">相似度阈值</label>
            <span className="text-sm text-muted-foreground">{threshold.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={threshold}
            onChange={(e) => void handleThresholdChange(parseFloat(e.target.value))}
            className="w-full"
            disabled={!enabled}
          />
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span>更宽松</span>
            <span>更严格</span>
          </div>
        </div>
      </div>

      {(isCreating || editingId) && (
        <div className="mb-6 rounded-2xl border-2 border-accent bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-medium">{isCreating ? '新建模板' : '编辑模板'}</h3>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void handleCancel()}>
                <X className="mr-2 h-4 w-4" />
                取消
              </Button>
              <Button onClick={() => void handleSave()}>
                <Save className="mr-2 h-4 w-4" />
                保存
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">模板名称</label>
              <input
                type="text"
                value={editForm.name || ''}
                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="例如：请假申请"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">触发关键词</label>
              <input
                type="text"
                value={(editForm.triggerKeywords || []).join(', ')}
                onChange={(e) => handleKeywordsChange(e.target.value)}
                placeholder="用逗号分隔，例如：请假, 病假, 年假"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                当说话内容包含这些关键词时，将匹配此模板
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">模板内容</label>
              <textarea
                value={editForm.content || ''}
                onChange={(e) => setEditForm((prev) => ({ ...prev, content: e.target.value }))}
                placeholder="输入模板内容，使用 {{变量名}} 表示占位符"
                rows={10}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                使用 {'{{变量名}}'} 表示占位符，AI 会根据你的需求自动填充
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {templates.map((template) => (
          <div
            key={template.id}
            className={cn(
              'rounded-2xl border border-border/50 bg-card p-4 transition-opacity',
              !template.enabled && 'opacity-50',
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{template.name}</h4>
                    {template.id.startsWith('builtin_') && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        内置
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    关键词：{template.triggerKeywords.join(', ')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleToggleTemplate(template)}
                  className={cn(
                    template.enabled ? 'bg-green-500/10 text-green-600 hover:bg-green-500/20' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {template.enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void handleEdit(template)}>
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void handleDelete(template.id)} className="text-red-500 hover:bg-red-500/10">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {editingId === template.id && (
              <div className="mt-3 rounded-lg border border-border/50 bg-muted/30 p-3">
                <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
                  {template.content}
                </pre>
              </div>
            )}
          </div>
        ))}

        {templates.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/50 bg-card py-12 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">暂无模板，点击"新建模板"创建</p>
          </div>
        )}
      </div>
    </Page>
  )
}
