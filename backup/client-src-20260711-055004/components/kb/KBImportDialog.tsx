// 知识库导入对话框：4 个 Tab
//  - 上传文件（txt/md/pdf）
//  - 手动输入（title + content textarea）
//  - 从历史导入（v1 占位）
//  - 从会议导入（v1 占位）
//
// 用 inline fixed overlay 代替 Dialog 组件（与 SettingsDialog 风格一致）

import { useState } from 'react'
import { Database, X } from 'lucide-react'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ragAddText, ragAddFile } from '@/services/rag/bridge'

type Tab = 'upload' | 'manual' | 'history' | 'meeting'

interface Props {
  open: boolean
  onClose: () => void
  onImported: () => void
  /** 嵌入模型是否就绪；未就绪时阻断导入 */
  modelReady: boolean
  /** 模型未就绪时，在对话框内一键触发下载 */
  onInitModel?: () => void | Promise<void>
}

const tabs: { id: Tab; label: string }[] = [
  { id: 'upload',  label: '📄 上传文件' },
  { id: 'manual',  label: '✏️ 手动输入' },
  { id: 'history', label: '🎙 从历史' },
  { id: 'meeting', label: '📋 从会议' },
]

export default function KBImportDialog({
  open,
  onClose,
  onImported,
  modelReady,
  onInitModel,
}: Props) {
  const [tab, setTab] = useState<Tab>('upload')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 手动输入
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  // 上传
  const [pickedPath, setPickedPath] = useState<string | null>(null)

  if (!open) return null

  const reset = () => {
    setTab('upload')
    setError(null)
    setBusy(false)
    setTitle('')
    setContent('')
    setPickedPath(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  // 上传
  const handlePickFile = async () => {
    const sel = await openFileDialog({
      multiple: false,
      directory: false,
      filters: [{ name: '文档', extensions: ['txt', 'md', 'markdown', 'pdf'] }],
    })
    if (typeof sel === 'string') setPickedPath(sel)
  }
  const handleUpload = async () => {
    if (!pickedPath) return
    setBusy(true)
    setError(null)
    try {
      await ragAddFile(pickedPath)
      onImported()
      handleClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // 手动
  const handleManualSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      setError('标题和内容都不能为空')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await ragAddText({ title: title.trim(), content: content.trim() })
      onImported()
      handleClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="relative flex w-[90vw] max-w-2xl flex-col overflow-hidden rounded-xl bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">导入到知识库</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="关闭"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTab(t.id); setError(null) }}
              className={cn(
                'flex-1 px-4 py-3 text-sm transition-colors',
                tab === t.id
                  ? 'border-b-2 border-primary font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 模型未就绪告警 — 拦住用户，必须先加载嵌入模型 */}
        {!modelReady && (
          <div className="flex items-start gap-3 border-b border-border bg-warning/10 px-6 py-4 text-sm">
            <Database className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="flex-1">
              <div className="font-medium text-foreground">嵌入模型未加载</div>
              <p className="mt-1 text-xs text-muted-foreground">
                导入文档前需要先把 BGE-small-zh-v1.5 下载到本地（约 24MB，仅首次需联网）。
              </p>
              {onInitModel && (
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => void onInitModel()}
                  disabled={busy}
                >
                  {busy ? '加载中…' : '加载嵌入模型'}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="space-y-4 px-6 py-5 min-h-[260px]">
          {tab === 'upload' && (
            <>
              <p className="text-sm text-muted-foreground">
                支持 .txt / .md / .pdf 文件，单文档上限 20 万字符。
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => void handlePickFile()} disabled={busy}>
                  选择文件
                </Button>
                <span className="truncate text-sm text-muted-foreground">
                  {pickedPath ?? '（未选择）'}
                </span>
              </div>
            </>
          )}

          {tab === 'manual' && (
            <>
              <div>
                <label className="text-sm font-medium">标题</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：产品术语备忘"
                  className="mt-1 w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-sm font-medium">内容</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={10}
                  placeholder="粘入整段文本，会自动按段落切块（~300 字/块，重叠 50 字）"
                  className="mt-1 w-full resize-y rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {content.length.toLocaleString()} 字符
                </p>
              </div>
            </>
          )}

          {tab === 'history' && (
            <div className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              🎙 从历史导入
              <br />
              <span className="mt-2 block text-xs">
                v1：推荐在「历史」页选好记录后另存到知识库。批量导入开发中。
              </span>
            </div>
          )}

          {tab === 'meeting' && (
            <div className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              📋 从会议导入
              <br />
              <span className="mt-2 block text-xs">
                v1：可在「会议纪要」页选好总结后另存到知识库。批量导入开发中。
              </span>
            </div>
          )}

          {error && (
            <div className="rounded border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-6 py-3">
          <Button variant="ghost" onClick={handleClose} disabled={busy}>
            取消
          </Button>
          {tab === 'upload' && (
            <Button
              onClick={() => void handleUpload()}
              disabled={busy || !pickedPath || !modelReady}
              title={!modelReady ? '嵌入模型未加载' : undefined}
            >
              {busy ? '导入中…' : '导入'}
            </Button>
          )}
          {tab === 'manual' && (
            <Button
              onClick={() => void handleManualSubmit()}
              disabled={busy || !modelReady}
              title={!modelReady ? '嵌入模型未加载' : undefined}
            >
              {busy ? '导入中…' : '导入'}
            </Button>
          )}
          {(tab === 'history' || tab === 'meeting') && (
            <Button disabled>敬请期待</Button>
          )}
        </div>
      </div>
    </div>
  )
}
