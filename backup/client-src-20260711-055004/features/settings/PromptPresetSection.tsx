import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { BUILTIN_PRESETS, type PromptPreset, type PromptPresetMode } from '@/services/store'

export default function PromptPresetSection({
  mode,
  presets,
  activePresetId,
  editingPreset,
  onSelectPreset,
  onStartNewPreset,
  onStartEditing,
  onEditingPresetChange,
  onCancelEditing,
  onSavePreset,
  onDeletePreset,
}: {
  mode: PromptPresetMode
  presets: PromptPreset[]
  activePresetId: string
  editingPreset: PromptPreset | null
  onSelectPreset: (id: string) => void
  onStartNewPreset: (mode: PromptPresetMode) => void
  onStartEditing: (preset: PromptPreset) => void
  onEditingPresetChange: (preset: PromptPreset) => void
  onCancelEditing: () => void
  onSavePreset: (preset: PromptPreset) => void
  onDeletePreset: (id: string) => void
}) {
  const isChat = mode === 'chat'
  const title = isChat ? 'AI 对话模式' : '润色模式'
  const description = isChat
    ? '选择或自定义 AI 对话的角色与回答风格（按住右 Ctrl 触发）。'
    : '选择或自定义 AI 对语音文本的处理方式（按住说话 / 免提触发）。'

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{title}</h2>
              <span
                className={`rounded px-1.5 text-xs ${
                  isChat
                    ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                    : 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
                }`}
              >
                {isChat ? 'Chat' : '校对'}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
          <button
            onClick={() => onStartNewPreset(mode)}
            className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent"
          >
            <Plus className="h-3 w-3" /> 新建
          </button>
        </div>

        <div className="space-y-2">
          {presets.map((preset) => {
            // 防御性过滤：当前 section 只显示匹配 mode 的预设（即便父组件传错了也不显示错的）
            if ((preset.mode ?? 'proofread') !== mode) return null
            return (
              <div
                key={preset.id}
                className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                  activePresetId === preset.id
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border hover:bg-accent/50'
                }`}
                onClick={() => onSelectPreset(preset.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                        activePresetId === preset.id ? 'border-primary' : 'border-muted-foreground/40'
                      }`}
                    >
                      {activePresetId === preset.id && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{preset.name}</p>
                        {preset.builtin && (
                          <span className="rounded border px-1 text-xs text-muted-foreground">内置</span>
                        )}
                        <span
                          className={`rounded px-1 text-xs ${
                            preset.mode === 'chat'
                              ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                              : 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {preset.mode === 'chat' ? 'Chat' : '校对'}
                        </span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {preset.systemPrompt.slice(0, 60)}
                        {preset.systemPrompt.length > 60 ? '...' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="ml-2 flex shrink-0 items-center gap-1">
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        onStartEditing({ ...preset })
                      }}
                      className="rounded p-1.5 hover:bg-accent"
                      aria-label="编辑"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>

                    {!preset.builtin && (
                      <button
                        onClick={(event) => {
                          event.stopPropagation()
                          onDeletePreset(preset.id)
                        }}
                        className="rounded p-1.5 hover:bg-accent"
                        aria-label="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {editingPreset && (
          <div className="mt-4 space-y-3 rounded-lg border border-primary/30 bg-muted p-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">名称</label>
              <input
                value={editingPreset.name}
                onChange={(event) => onEditingPresetChange({ ...editingPreset, name: event.target.value })}
                placeholder="例如：会议纪要整理"
                className="h-9 w-full rounded-md border border-input-border bg-input-bg px-3 text-sm"
                disabled={editingPreset.builtin}
              />
            </div>

            {!editingPreset.builtin && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">模式</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => onEditingPresetChange({ ...editingPreset, mode: 'proofread' })}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                      (editingPreset.mode ?? 'proofread') === 'proofread'
                        ? 'border-primary/50 bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    校对（润色模式）
                  </button>
                  <button
                    onClick={() => onEditingPresetChange({ ...editingPreset, mode: 'chat' })}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                      editingPreset.mode === 'chat'
                        ? 'border-sky-500/50 bg-sky-500/10 text-foreground'
                        : 'border-border text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    Chat（AI 对话模式）
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  切换模式会改变该预设的归属：校对预设由按住说话触发，Chat 预设由按住右 Ctrl 触发。
                </p>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">系统提示词（System Prompt）</label>
              <p className="mb-2 text-xs text-muted-foreground">
                {editingPreset.mode === 'chat'
                  ? 'Chat 模式：AI 将以该角色自由回答问题，可返回代码块、列表、Markdown 等格式内容。'
                  : '校对模式：定义 AI 的角色和处理规则，语音文本会自动附加为用户消息，AI 只输出处理后的文本。'}
              </p>
              <textarea
                value={editingPreset.systemPrompt}
                onChange={(event) => onEditingPresetChange({ ...editingPreset, systemPrompt: event.target.value })}
                placeholder={editingPreset.mode === 'chat' ? '定义 AI 的角色和行为...' : '定义 AI 的角色、行为和处理规则...'}
                rows={8}
                className="w-full resize-none rounded-md border border-input-border bg-input-bg px-3 py-2 text-xs leading-normal"
              />
            </div>

            <div className="flex justify-end gap-2">
              {editingPreset.builtin && (
                <button
                  onClick={() => {
                    const original = BUILTIN_PRESETS.find((builtin) => builtin.id === editingPreset.id)
                    if (original) onEditingPresetChange({ ...original })
                  }}
                  className="px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  恢复默认
                </button>
              )}

              <button
                onClick={onCancelEditing}
                className="rounded-md border px-3 py-1 text-xs transition-colors hover:bg-accent"
              >
                取消
              </button>
              <button
                disabled={!editingPreset.name.trim() || !editingPreset.systemPrompt.trim()}
                onClick={() => onSavePreset(editingPreset)}
                className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                保存
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
