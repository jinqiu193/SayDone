// 知识库管理页
// 顶部状态卡：模型状态 + 文档/分块数
// 主体：搜索测试 + 文档列表
// 右下角按钮：打开导入对话框

import { useCallback, useEffect, useRef, useState } from 'react'
import { Database, Download, RefreshCw, Search, PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import KBDocumentList from '@/components/kb/KBDocumentList'
import KBImportDialog from '@/components/kb/KBImportDialog'
import {
  ragGetStatus,
  ragInitModel,
  ragSearch,
  onRagModelProgress,
} from '@/services/rag/bridge'
import type { RAGChunkHit, RAGStatus } from '@/services/rag/types'
import { ragListDocuments } from '@/services/rag/bridge'
import type { RAGDocument } from '@/services/rag/types'

export default function KnowledgeBase() {
  const [status, setStatus] = useState<RAGStatus | null>(null)
  const [docs, setDocs] = useState<RAGDocument[]>([])
  const [importOpen, setImportOpen] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null)
  const [busyInit, setBusyInit] = useState(false)

  // 搜索测试
  const [searchQ, setSearchQ] = useState('')
  const [hits, setHits] = useState<RAGChunkHit[] | null>(null)
  const [busySearch, setBusySearch] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [s, ds] = await Promise.all([ragGetStatus(), ragListDocuments()])
      setStatus(s)
      setDocs(ds)
    } catch (e) {
      console.error('[kb] refresh failed', e)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 模型下载进度
  const unlistenRef = useRef<(() => void) | null>(null)
  // 用 ref 持有最新 refresh，避免 useEffect 依赖 refresh 导致 listener 被反复重注册
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const u = await onRagModelProgress((ev) => {
        if (ev.percent !== undefined) setDownloadProgress(ev.percent)
        if (ev.message !== undefined) setDownloadMsg(ev.message)
        if (ev.stage === 'ready') {
          setDownloadProgress(null)
          setDownloadMsg(null)
          void refreshRef.current()
        }
        if (ev.stage === 'error') {
          setBusyInit(false)
        }
      })
      if (cancelled) {
        u()
      } else {
        unlistenRef.current = u
      }
    })()
    return () => {
      cancelled = true
      unlistenRef.current?.()
    }
  }, [])

  const handleInit = async () => {
    setBusyInit(true)
    setDownloadProgress(0)
    setDownloadMsg('开始下载嵌入模型…')
    try {
      await ragInitModel()
      await refresh()
    } catch (e) {
      setDownloadMsg('下载失败：' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusyInit(false)
    }
  }

  const handleSearch = async () => {
    const q = searchQ.trim()
    if (!q) return
    setBusySearch(true)
    setSearchError(null)
    try {
      const r = await ragSearch({ query: q, top_k: status?.top_k ?? 5 })
      setHits(r)
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : String(e))
      setHits(null)
    } finally {
      setBusySearch(false)
    }
  }

  const statusLabel = (() => {
    if (!status) return '加载中…'
    switch (status.model_status) {
      case 'ready': return `✅ 已加载 ${status.model_name}`
      case 'downloading': return '⏬ 下载模型中…'
      case 'error': return '❌ 模型加载失败'
      default: return '⚠️ 模型未初始化'
    }
  })()

  const showProgress = downloadProgress !== null

  return (
    <div className="mx-auto max-w-5xl">
      {/* Title */}
      <div className="mb-2 flex items-center gap-2">
        <Database className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">知识库</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        在「AI 整理」设置页启用「使用知识库」后，AI Chat 模式会自动检索本地知识库片段作为上下文。
        本页管理导入的文档、嵌入模型状态、测试召回效果。
      </p>

      {/* Status card */}
      <div className="mb-6 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">{statusLabel}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {status
                ? `共 ${status.doc_count} 个文档 · ${status.chunk_count} 个分块 · 缓存：${status.cache_dir || '默认目录'}`
                : '正在读取…'}
            </div>
            {showProgress && (
              <div className="mt-2">
                <div className="h-1.5 w-64 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${downloadProgress ?? 0}%` }}
                  />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {downloadMsg ?? `${downloadProgress ?? 0}%`}
                </div>
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {status?.model_status !== 'ready' && (
              <Button
                onClick={() => void handleInit()}
                disabled={busyInit || status?.model_status === 'downloading'}
              >
                <Download className="mr-2 h-4 w-4" />
                {busyInit ? '加载中…' : status?.model_status === 'downloading' ? '下载中…' : '加载嵌入模型'}
              </Button>
            )}
            <Button variant="outline" onClick={() => void refresh()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新
            </Button>
            <Button onClick={() => setImportOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              导入
            </Button>
          </div>
        </div>
      </div>

      {/* Search test */}
      <div className="mb-2 text-sm font-medium">召回测试</div>
      <div className="mb-6 flex items-center gap-2">
        <input
          type="text"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch() }}
          placeholder="输入查询，看召回哪些分块（仅本地模型，不会发送任何云请求）"
          className="flex-1 rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button onClick={() => void handleSearch()} disabled={busySearch || !searchQ.trim() || !status || status.model_status !== 'ready'}>
          <Search className="mr-2 h-4 w-4" />
          {busySearch ? '查询中…' : '查询'}
        </Button>
      </div>
      {searchError && (
        <div className="mb-4 rounded border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {searchError}
        </div>
      )}
      {hits !== null && (
        <div className="mb-6 space-y-2">
          {hits.length === 0 ? (
            <div className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              没有命中任何分块（score 阈值 = 0.2）
            </div>
          ) : (
            hits.map((h) => (
              <div key={h.chunk_id} className="rounded border border-border bg-card p-3 text-sm">
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>📄 {h.doc_title} · 第 {h.chunk_index + 1} 块</span>
                  <span className="tabular-nums">{Math.round(h.score * 100)}% 相似</span>
                </div>
                <div className="whitespace-pre-wrap text-foreground">{h.content}</div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Document list */}
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">文档列表</div>
        <span className="text-xs text-muted-foreground">{docs.length} 个</span>
      </div>
      <KBDocumentList docs={docs} onChanged={() => void refresh()} />

      <KBImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => void refresh()}
        modelReady={status?.model_status === 'ready'}
        onInitModel={() => void handleInit()}
      />
    </div>
  )
}
