// AI 整理设置页底部 — 知识库 (RAG) 卡片
//  - 启用开关
//  - Top-K 选择
//  - 模型状态 + 文档计数
//  - 跳转「知识库」管理页链接

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  ragGetStatus,
  ragSetEnabled,
  ragInitModel,
} from '@/services/rag/bridge'
import type { RAGStatus } from '@/services/rag/types'

export default function KnowledgeBaseToggle() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<RAGStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setStatus(await ragGetStatus())
    } catch (e) {
      console.error('[kb-toggle] load failed', e)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const handleToggle = async (next: boolean) => {
    if (!status) return
    const prev = status.enabled
    // 乐观更新
    setStatus({ ...status, enabled: next })
    try {
      await ragSetEnabled({ enabled: next, topK: status.top_k })
    } catch (e) {
      console.error('[kb-toggle] save failed', e)
      // 回滚
      setStatus({ ...status, enabled: prev })
    }
  }

  const handleTopKChange = async (n: number) => {
    if (!status) return
    await ragSetEnabled({ enabled: status.enabled, topK: n })
    setStatus({ ...status, top_k: n })
  }

  const handleInit = async () => {
    setBusy(true)
    try {
      await ragInitModel()
      await refresh()
    } catch (e) {
      console.error('[kb-toggle] init model failed', e)
    } finally {
      setBusy(false)
    }
  }

  const modelLabel = (() => {
    if (!status) return '加载中…'
    switch (status.model_status) {
      case 'ready': return `✅ ${status.model_name}`
      case 'downloading': return '⏬ 下载中…'
      case 'error': return '❌ 加载失败'
      default: return '⚠️ 未初始化'
    }
  })()

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">知识库 (RAG)</h2>
          </div>
          <Switch
            checked={status?.enabled ?? false}
            onChange={() => {
              if (status) void handleToggle(!status.enabled)
            }}
            disabled={!status}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          启用后，AI Chat 模式会自动从本地知识库检索 Top-K 个相关片段并拼到系统提示词。仅 Chat 模式生效，普通模式不受影响。
        </p>

        <div className="flex flex-wrap items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Top-K</span>
            <select
              value={status?.top_k ?? 5}
              onChange={(e) => void handleTopKChange(Number(e.target.value))}
              className="rounded border border-input bg-background px-2 py-1 text-sm"
              disabled={!status}
            >
              {[3, 5, 8, 10].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div className="text-xs text-muted-foreground">
            {modelLabel}
            {status && status.model_status === 'ready' && (
              <span className="ml-2">
                · {status.doc_count} 文档 · {status.chunk_count} 分块
              </span>
            )}
          </div>

          {status && status.model_status !== 'ready' && status.model_status !== 'downloading' && (
            <button
              type="button"
              onClick={() => void handleInit()}
              disabled={busy}
              className="rounded border border-input px-2 py-1 text-xs transition-colors hover:bg-accent disabled:opacity-50"
            >
              {busy ? '加载中…' : '加载嵌入模型'}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate('/knowledge')}
          className="text-xs text-primary hover:underline"
        >
          管理知识库 →
        </button>
      </CardContent>
    </Card>
  )
}
