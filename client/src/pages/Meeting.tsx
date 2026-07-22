// 会议纪要主页面
//
// 视图：
//   - list（默认）：开始会议 + 历史会议列表
//   - detail：单条会议详情（实时字幕 / 完整转写 / AI 总结 / 编辑）
//
// 数据流：
//   - 当前录音 done 时 addHistory(isMeeting=true) → 出现在列表
//   - 历史会议：listHistory() + 前端 filter isMeeting === true
//   - 删除 / 重新总结：直接复用 updateHistoryRecord / deleteHistory

import { useEffect, useMemo, useState } from 'react'
import { Mic, Square, AlertCircle, ArrowLeft, Trash2, ChevronRight, Sparkles, FileText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Page } from '@/components/ui/Page'
import { PageHeader } from '@/components/ui/PageHeader'
import { MeetingService } from '@/services/meeting/MeetingService'
import type { MeetingRuntime } from '@/services/meeting/types'
import { MeetingLiveCaption } from '@/components/meeting/MeetingLiveCaption'
import { MeetingResult } from '@/components/meeting/MeetingResult'
import { addHistory, deleteHistory, getSetting, listHistory, type HistoryRecord } from '@/services/store'
import { addRuntimeEvent } from '@/services/debugLog'

function formatElapsed(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h > 0
    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const isSameDay = d.toDateString() === today.toDateString()
  const pad = (n: number) => String(n).padStart(2, '0')
  if (isSameDay) {
    return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function Meeting() {
  const [runtime, setRuntime] = useState<MeetingRuntime>(MeetingService.getRuntime())
  const [historyId, setHistoryId] = useState<string>('')
  const [summary, setSummary] = useState<string>('')
  const [meetings, setMeetings] = useState<HistoryRecord[]>([])
  const [selectedMeeting, setSelectedMeeting] = useState<HistoryRecord | null>(null)
  const [deletingId, setDeletingId] = useState<string>('')

  useEffect(() => {
    return MeetingService.subscribe(setRuntime)
  }, [])

  // 列表懒加载（仅 list 视图需要）
  const loadMeetings = async () => {
    try {
      const all = await listHistory({ limit: 200, offset: 0 })
      setMeetings(all.filter((r) => r.isMeeting))
    } catch (err) {
      addRuntimeEvent('warn', 'meeting', '加载会议列表失败', { error: String(err) })
    }
  }
  useEffect(() => {
    void loadMeetings()
  }, [])

  // 状态从 recording → done 时自动保存到 history
  useEffect(() => {
    if (runtime.state === 'done' && runtime.fullText && !historyId) {
      const id = `meeting-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const title = generateMeetingTitle(runtime.fullText)
      void getSetting('workMode', 'cloud_api').then((workMode) => {
        addHistory({
          id,
          timestamp: Date.now(),
          asrText: runtime.fullText,
          llmText: runtime.fullText,
          asrMs: 0,
          llmMs: 0,
          durationSec: runtime.elapsedSec,
          charCount: runtime.fullText.length,
          isEmpty: !runtime.fullText.trim(),
          isMeeting: true,
          meetingTitle: title,
          meetingSummary: '',
          meetingSegments: runtime.finalizedSegments,
          workMode: (workMode === 'server' || workMode === 'cloud_api' || workMode === 'local')
            ? workMode : 'cloud_api',
        }).then(() => {
          setHistoryId(id)
          addRuntimeEvent('info', 'meeting', '会议已保存到历史', { id, chars: runtime.fullText.length })
          void loadMeetings()
        }).catch((err) => {
          addRuntimeEvent('error', 'meeting', '保存会议失败', { error: String(err) })
        })
      })
    }
  }, [runtime.state])  // eslint-disable-line react-hooks/exhaustive-deps

  const handleStart = () => {
    setHistoryId('')
    setSummary('')
    setSelectedMeeting(null)
    void MeetingService.start()
  }

  const handleStop = () => {
    void MeetingService.stop()
  }

  const handleNewMeeting = () => {
    MeetingService.cancel()
    setHistoryId('')
    setSummary('')
  }

  const handleBackToList = () => {
    setSelectedMeeting(null)
    setHistoryId('')
    setSummary('')
  }

  const handleDelete = async (id: string) => {
    if (deletingId) return
    if (!confirm('确定删除这条会议纪要？')) return
    setDeletingId(id)
    try {
      await deleteHistory(id)
      setMeetings((prev) => prev.filter((m) => m.id !== id))
      if (selectedMeeting?.id === id) setSelectedMeeting(null)
      addRuntimeEvent('info', 'meeting', '会议已删除', { id })
    } catch (err) {
      addRuntimeEvent('error', 'meeting', '删除失败', { id, error: String(err) })
    } finally {
      setDeletingId('')
    }
  }

  // 当前 detail 视图的内容：要么是刚录完的，要么是用户选的
  const detailFullText = useMemo(() => {
    if (runtime.state === 'done' && runtime.fullText) return runtime.fullText
    return selectedMeeting?.asrText || ''
  }, [runtime.state, runtime.fullText, selectedMeeting])

  const detailSummary = useMemo(() => {
    if (runtime.state === 'done' && summary) return summary
    return selectedMeeting?.meetingSummary || ''
  }, [runtime.state, summary, selectedMeeting])

  const detailHistoryId = useMemo(() => {
    if (runtime.state === 'done' && historyId) return historyId
    return selectedMeeting?.id || ''
  }, [runtime.state, historyId, selectedMeeting])

  const inDetail = runtime.state !== 'idle' || selectedMeeting !== null

  return (
    <Page className="space-y-6">
      <PageHeader
        title="会议纪要"
        description="长篇录、随录随成、过耳不留痕。"
        action={
          inDetail ? (
            <Button variant="outline" size="sm" onClick={handleBackToList} className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" /> 返回列表
            </Button>
          ) : undefined
        }
      />

      {/* 控制区 */}
      <div className="flex items-center gap-4 rounded-2xl bg-card p-5">
        {runtime.state === 'recording' ? (
          <>
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
              <span className="text-sm font-medium text-foreground">
                录音中 {formatElapsed(runtime.elapsedSec)}
              </span>
            </div>
            <Button onClick={handleStop} variant="destructive" className="ml-auto gap-1.5">
              <Square className="h-4 w-4" /> 结束会议
            </Button>
          </>
        ) : runtime.state === 'finalizing' ? (
          <span className="text-sm text-muted-foreground">
            正在收尾识别…（已识别 {runtime.finalizedSegments.length} 句）
          </span>
        ) : runtime.state === 'done' ? (
          <>
            <span className="text-sm text-muted-foreground">
              会议已结束 · 时长 {formatElapsed(runtime.elapsedSec)} · 字符 {runtime.fullText.length}
            </span>
            <Button onClick={handleNewMeeting} variant="outline" className="ml-auto gap-1.5">
              <Mic className="h-4 w-4" /> 新会议
            </Button>
          </>
        ) : (
          <>
            <Button onClick={handleStart} className="gap-1.5">
              <Mic className="h-4 w-4" /> 开始会议
            </Button>
            <span className="text-xs text-muted-foreground">
              支持云 API / 本地 ASR / 服务器三种模式
            </span>
          </>
        )}
      </div>

      {runtime.errorMessage && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{runtime.errorMessage}</span>
        </div>
      )}

      {/* 实时字幕（仅录音中） */}
      {runtime.state === 'recording' && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">实时字幕</h2>
          <MeetingLiveCaption runtime={runtime} />
        </section>
      )}

      {/* List 视图：会议列表 */}
      {!inDetail && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              历史会议 · {meetings.length} 条
            </h2>
          </div>
          {meetings.length === 0 ? (
            <div className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground">
              暂无会议。点击上方"开始会议"录制第一条。
            </div>
          ) : (
            <ul className="space-y-2">
              {meetings.map((m) => (
                <li key={m.id}>
                  <div className="group flex items-center gap-3 rounded-xl bg-card p-4 transition-colors hover:bg-surface-2">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedMeeting(m)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {m.meetingTitle || '未命名会议'}
                        </span>
                        {m.meetingSummary && (
                          <span title="已生成 AI 总结" className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            <Sparkles className="inline h-2.5 w-2.5" /> 已总结
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{formatTimestamp(m.timestamp)}</span>
                        <span>·</span>
                        <span>{formatElapsed(m.durationSec || 0)}</span>
                        <span>·</span>
                        <span>{m.charCount || 0} 字</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedMeeting(m)}
                      className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-surface-3 hover:text-foreground group-hover:opacity-100"
                      aria-label="查看"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        void handleDelete(m.id)
                      }}
                      disabled={deletingId === m.id}
                      className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 disabled:opacity-50"
                      aria-label="删除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Detail 视图：实时字幕（finalizing） / 转写 + 总结 */}
      {inDetail && runtime.state !== 'recording' && (
        <>
          {runtime.state === 'finalizing' && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">实时字幕</h2>
              <MeetingLiveCaption runtime={runtime} />
            </section>
          )}

          {detailFullText && detailHistoryId && (
            <MeetingResult
              historyId={detailHistoryId}
              fullText={detailFullText}
              summary={detailSummary}
              onSummaryChange={async (s) => {
                setSummary(s)
                // 持久化到 selected meeting
                if (selectedMeeting && s) {
                  try {
                    await (await import('@/services/store')).updateHistoryRecord(
                      selectedMeeting.id,
                      { meetingSummary: s }
                    )
                    setSelectedMeeting({ ...selectedMeeting, meetingSummary: s })
                  } catch (err) {
                    addRuntimeEvent('warn', 'meeting', '保存总结失败', { error: String(err) })
                  }
                }
              }}
            />
          )}
        </>
      )}
    </Page>
  )
}

/** 简单从首段取标题（前 30 字） */
function generateMeetingTitle(text: string): string {
  const firstLine = text.split('\n')[0]?.trim() || ''
  return firstLine.slice(0, 30) + (firstLine.length > 30 ? '…' : '') || `会议 ${new Date().toLocaleString('zh-CN')}`
}