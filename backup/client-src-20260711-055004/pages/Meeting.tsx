// 会议纪要主页面

import { useEffect, useState } from 'react'
import { Mic, Square, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MeetingService } from '@/services/meeting/MeetingService'
import type { MeetingRuntime } from '@/services/meeting/types'
import { MeetingLiveCaption } from '@/components/meeting/MeetingLiveCaption'
import { MeetingResult } from '@/components/meeting/MeetingResult'
import { addHistory } from '@/services/store'
import { addRuntimeEvent } from '@/services/debugLog'

function formatElapsed(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h > 0
    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function Meeting() {
  const [runtime, setRuntime] = useState<MeetingRuntime>(MeetingService.getRuntime())
  const [historyId, setHistoryId] = useState<string>('')
  const [summary, setSummary] = useState<string>('')

  useEffect(() => {
    return MeetingService.subscribe(setRuntime)
  }, [])

  // 状态从 recording → done 时自动保存到 history
  useEffect(() => {
    if (runtime.state === 'done' && runtime.fullText && !historyId) {
      const id = `meeting-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const title = generateMeetingTitle(runtime.fullText)
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
        workMode: 'cloud_api',
      }).then(() => {
        setHistoryId(id)
        addRuntimeEvent('info', 'meeting', '会议已保存到历史', { id, chars: runtime.fullText.length })
      }).catch((err) => {
        addRuntimeEvent('error', 'meeting', '保存会议失败', { error: String(err) })
      })
    }
  }, [runtime.state])  // eslint-disable-line react-hooks/exhaustive-deps

  const handleStart = () => {
    setHistoryId('')
    setSummary('')
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

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">会议纪要</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            长时间录音 + 边录边出字 + 不保留原始音频
          </p>
        </div>
      </header>

      {/* 控制区 */}
      <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
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
          <span className="text-sm text-muted-foreground">正在收尾识别…</span>
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
              需要先在「语音引擎」中切换到「云 API」模式
            </span>
          </>
        )}
      </div>

      {runtime.errorMessage && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{runtime.errorMessage}</span>
        </div>
      )}

      {/* 实时字幕 */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">实时字幕</h2>
        <MeetingLiveCaption runtime={runtime} />
      </section>

      {/* 结果区 */}
      {runtime.state === 'done' && runtime.fullText && (
        <MeetingResult
          historyId={historyId}
          fullText={runtime.fullText}
          summary={summary}
          onSummaryChange={setSummary}
        />
      )}
    </div>
  )
}

/** 简单从首段取标题（前 30 字） */
function generateMeetingTitle(text: string): string {
  const firstLine = text.split('\n')[0]?.trim() || ''
  return firstLine.slice(0, 30) + (firstLine.length > 30 ? '…' : '') || `会议 ${new Date().toLocaleString('zh-CN')}`
}
