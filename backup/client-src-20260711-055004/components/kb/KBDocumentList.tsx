// 知识库文档列表：标题 + 来源标签 + 字数 / 块数 / 时间 + 删除按钮

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { RAGDocument } from '@/services/rag/types'
import { SOURCE_LABELS } from '@/services/rag/types'
import { ragDeleteDocument } from '@/services/rag/bridge'

interface Props {
  docs: RAGDocument[]
  onChanged: () => void
}

function formatTime(ms: number) {
  const diff = Date.now() - ms
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  return new Date(ms).toLocaleDateString('zh-CN')
}

export default function KBDocumentList({ docs, onChanged }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除该文档？对应分块会一并删除。')) return
    setBusyId(id)
    try {
      await ragDeleteDocument(id)
      onChanged()
    } catch (e) {
      alert('删除失败：' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusyId(null)
    }
  }

  if (docs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
        知识库暂无内容。点击右上角「导入」开始添加文档。
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left font-medium">来源</th>
            <th className="px-4 py-2 text-left font-medium">标题</th>
            <th className="px-4 py-2 text-right font-medium">字数</th>
            <th className="px-4 py-2 text-right font-medium">分块</th>
            <th className="px-4 py-2 text-right font-medium">添加时间</th>
            <th className="w-12 px-4 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {docs.map((d) => {
            const sl = SOURCE_LABELS[d.source]
            return (
              <tr key={d.id} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <span title={sl.label} className="inline-flex items-center gap-1 text-base">
                    <span>{sl.emoji}</span>
                    <span className="text-xs text-muted-foreground">{sl.label}</span>
                  </span>
                </td>
                <td className="px-4 py-3 font-medium">{d.title}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {d.char_count.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {d.chunk_count}
                </td>
                <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                  {formatTime(d.created_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={busyId === d.id}
                    onClick={() => void handleDelete(d.id)}
                    aria-label="删除"
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
