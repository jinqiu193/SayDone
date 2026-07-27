// 知识库管理页
// 顶部状态卡：模型状态 + 文档/分块数
// 主体：搜索测试 + 文档列表
// 右下角按钮：打开导入对话框

import { useCallback, useEffect, useRef, useState } from 'react'
import { Database, Download, RefreshCw, Search, PlusCircle, Clock, Filter, ArrowUpDown, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Page } from '@/components/ui/Page'
import { PageHeader } from '@/components/ui/PageHeader'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import KBDocumentList from '@/components/kb/KBDocumentList'
import KBImportDialog from '@/components/kb/KBImportDialog'
import {
  ragGetStatus,
  ragInitModel,
  ragSearch,
  onRagModelProgress,
} from '@/services/rag/bridge'
import type { RAGChunkHit, RAGStatus, RAGSource } from '@/services/rag/types'
import { ragListDocuments } from '@/services/rag/bridge'
import type { RAGDocument } from '@/services/rag/types'

const MAX_SEARCH_HISTORY = 10

export default function KnowledgeBase() {
  const [status, setStatus] = useState<RAGStatus | null>(null)
  const [docs, setDocs] = useState<RAGDocument[]>([])
  const [importOpen, setImportOpen] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null)
  const [busyInit, setBusyInit] = useState(false)

  // 搜索增强
  const [searchQ, setSearchQ] = useState('')
  const [hits, setHits] = useState<RAGChunkHit[] | null>(null)
  const [busySearch, setBusySearch] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [scoreThreshold, setScoreThreshold] = useState(0.2)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [searchHistory, setSearchHistory] = useState<string[]>([])
  const [sourceFilter, setSourceFilter] = useState<RAGSource | 'all'>('all')
  const [sortBy, setSortBy] = useState<'score' | 'time'>('score')

  // 加载搜索历史
  useEffect(() => {
    const saved = localStorage.getItem('kb_search_history')
    if (saved) {
      try {
        setSearchHistory(JSON.parse(saved))
      } catch {
        // ignore
      }
    }
  }, [])

  const saveSearchHistory = (query: string) => {
    const updated = [query, ...searchHistory.filter((q) => q !== query)].slice(0, MAX_SEARCH_HISTORY)
    setSearchHistory(updated)
    localStorage.setItem('kb_search_history', JSON.stringify(updated))
  }

  const clearSearchHistory = () => {
    setSearchHistory([])
    localStorage.removeItem('kb_search_history')
  }

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
      const r = await ragSearch({ query: q, top_k: status?.top_k ?? 10 })
      // 应用相似度阈值过滤
      let filtered = r.filter((h) => h.score >= scoreThreshold)
      // 应用来源筛选（需要后端支持，这里先做前端过滤）
      // 按排序方式处理
      if (sortBy === 'time') {
        filtered.sort((a, b) => b.chunk_index - a.chunk_index)
      } else {
        filtered.sort((a, b) => b.score - a.score)
      }
      setHits(filtered)
      saveSearchHistory(q)
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
      case 'ready': return `已加载 ${status.model_name}`
      case 'downloading': return '下载模型中…'
      case 'error': return '模型加载失败'
      default: return '模型未初始化'
    }
  })()

  const showProgress = downloadProgress !== null

  return (
    <Page>
      <PageHeader
        title="知识库"
        description="导入本地文档作为 RAG 上下文。启用后，AI Chat 模式会先在本地知识库里检索相关片段，再交给 LLM 整理。"
        action={
          <Database className="h-6 w-6 text-primary" />
        }
      />

      {/* Status card */}
      <div className="mb-6 rounded-2xl bg-card p-5">
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

      {/* Search */}
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">召回测试</div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="h-7 text-xs"
        >
          <Filter className="mr-1 h-3 w-3" />
          {showAdvanced ? '隐藏' : '高级'}
        </Button>
      </div>

      {/* 高级选项 */}
      {showAdvanced && (
        <div className="mb-4 rounded-lg border border-border bg-card/50 p-4 space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium">相似度阈值</label>
              <span className="text-xs text-muted-foreground">{Math.round(scoreThreshold * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={scoreThreshold}
              onChange={(e) => setScoreThreshold(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>宽松</span>
              <span>严格</span>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="mb-2 block text-xs font-medium">排序方式</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSortBy('score')}
                  className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs transition-colors ${sortBy === 'score' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
                >
                  <ArrowUpDown className="h-3 w-3" />
                  相关度
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy('time')}
                  className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs transition-colors ${sortBy === 'time' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
                >
                  <Clock className="h-3 w-3" />
                  时间
                </button>
              </div>
            </div>
          </div>
          {searchHistory.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-medium">搜索历史</label>
                <button
                  type="button"
                  onClick={clearSearchHistory}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  清除
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {searchHistory.map((q, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setSearchQ(q); void handleSearch() }}
                    className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 搜索输入 */}
      <div className="mb-6 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch() }}
            placeholder="输入查询，看召回哪些分块（仅本地模型，不会发送任何云请求）"
            className="pl-10"
          />
        </div>
        <Button onClick={() => void handleSearch()} disabled={busySearch || !searchQ.trim() || !status || status.model_status !== 'ready'}>
          {busySearch ? '查询中…' : '查询'}
        </Button>
      </div>

      {searchError && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {searchError}
        </div>
      )}

      {hits !== null && (
        <div className="mb-6 space-y-2">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              找到 <span className="font-medium text-foreground">{hits.length}</span> 个相关分块
              {hits.length > 0 && (
                <span className="ml-2">
                  （阈值 {Math.round(scoreThreshold * 100)}%，排序：{sortBy === 'score' ? '相关度' : '时间'}）
                </span>
              )}
            </span>
          </div>
          {hits.length === 0 ? (
            <EmptyState title="没有命中任何分块" description={`阈值 ${Math.round(scoreThreshold * 100)}% 可能过高；导入更多文档或换关键词试试`} />
          ) : (
            hits.map((h) => (
              <div key={h.chunk_id} className="rounded-xl bg-card p-3 text-sm">
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span>{h.doc_title}</span>
                    <span>·</span>
                    <span>第 {h.chunk_index + 1} 块</span>
                  </div>
                  <span className="tabular-nums">
                    {Math.round(h.score * 100)}% 相似
                  </span>
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
    </Page>
  )
}