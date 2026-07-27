// 会议结果展示 + AI 总结

import { useEffect, useState } from 'react'
import { Copy, Sparkles, Loader2, Edit3, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { summarizeMeeting } from '@/services/bridge'
import { getSetting, updateHistoryRecord } from '@/services/store'
import { addRuntimeEvent } from '@/services/debugLog'

export function MeetingResult({
  historyId,
  fullText,
  summary,
  onSummaryChange,
  onFullTextChange,
}: {
  historyId: string
  fullText: string
  summary: string
  onSummaryChange: (s: string) => void
  onFullTextChange?: (s: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showSummary, setShowSummary] = useState(!!summary)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(fullText)

  useEffect(() => {
    if (!isEditing) {
      setEditText(fullText)
    }
  }, [fullText, isEditing])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullText)
    } catch { /* ignore */ }
  }

  const handleSummarize = async () => {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const aiProvider = (await getSetting('cloudAi.provider', 'deepseek')) as string
      const aiApiUrl = (await getSetting('cloudAi.apiUrl', '')) as string
      const aiApiKey = (await getSetting('cloudAi.apiKey', '')) as string
      const aiModel = (await getSetting('cloudAi.model', '')) as string

      if (aiProvider === 'ollama') {
        if (!aiApiUrl) {
          setError('请在「AI 供应商」中配置 Ollama 地址（默认 http://127.0.0.1:11434）')
          setLoading(false)
          return
        }
      } else {
        if (!aiApiUrl || !aiApiKey || !aiModel) {
          setError('请先在「AI 供应商」中配置 API')
          setLoading(false)
          return
        }
      }

      const result = await summarizeMeeting(fullText, {
        provider: aiProvider, api_url: aiApiUrl, api_key: aiApiKey, model: aiModel,
      })
      onSummaryChange(result.text)
      setShowSummary(true)
      try {
        await updateHistoryRecord(historyId, { meetingSummary: result.text })
      } catch (err) {
        addRuntimeEvent('warn', 'meeting', '保存 AI 总结失败', { error: String(err) })
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleStartEdit = () => {
    setEditText(fullText)
    setIsEditing(true)
  }

  const handleSaveEdit = async () => {
    const trimmedText = editText.trim()
    if (trimmedText === fullText.trim()) {
      setIsEditing(false)
      return
    }
    try {
      const charCount = trimmedText.length
      await updateHistoryRecord(historyId, { 
        asrText: trimmedText, 
        llmText: trimmedText,
        charCount,
      })
      onFullTextChange?.(trimmedText)
      setIsEditing(false)
      addRuntimeEvent('info', 'meeting', '会议内容已编辑', { id: historyId })
    } catch (err) {
      setError(String(err))
      addRuntimeEvent('error', 'meeting', '保存编辑失败', { id: historyId, error: String(err) })
    }
  }

  const handleCancelEdit = () => {
    setEditText(fullText)
    setIsEditing(false)
  }

  return (
    <div className="space-y-4 rounded-2xl bg-card p-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">完整转写</h2>
          {isEditing && (
            <span className="text-xs text-muted-foreground">编辑中</span>
          )}
        </div>
        {isEditing ? (
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full max-h-64 resize-none rounded-md bg-muted/30 p-3 text-sm leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-cta/30 custom-scrollbar"
            placeholder="输入转写内容..."
          />
        ) : (
          <p className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-sm leading-relaxed text-foreground custom-scrollbar">
            {fullText || '(无内容)'}
          </p>
        )}
        <div className="mt-2 flex gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSaveEdit}>
                <Save className="h-3.5 w-3.5" /> 保存
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCancelEdit}>
                <X className="h-3.5 w-3.5" /> 取消
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopy}>
                <Copy className="h-3.5 w-3.5" /> 复制文字
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleStartEdit}>
                <Edit3 className="h-3.5 w-3.5" /> 编辑
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleSummarize}
                disabled={loading || !fullText}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {summary ? '重新总结' : 'AI 总结'}
              </Button>
              {summary && (
                <Button variant="ghost" size="sm" onClick={() => setShowSummary((s) => !s)}>
                  {showSummary ? '收起总结' : '展开总结'}
                </Button>
              )}
            </>
          )}
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>

      {showSummary && summary && (
        <div>
          <h2 className="mb-2 text-lg font-semibold">AI 会议纪要</h2>
          <div className="prose prose-sm max-w-none whitespace-pre-wrap rounded-md bg-primary/5 p-4 text-foreground dark:prose-invert">
            {summary}
          </div>
        </div>
      )}
    </div>
  )
}
