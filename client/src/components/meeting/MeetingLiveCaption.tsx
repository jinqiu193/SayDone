// 会议实时字幕面板

import { useCallback, useEffect, useRef } from 'react'
import type { MeetingRuntime } from '@/services/meeting/types'

export function MeetingLiveCaption({ runtime }: { runtime: MeetingRuntime }) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const isAtBottomRef = useRef(true)

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const threshold = 50
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }, [])

  useEffect(() => {
    if (isAtBottomRef.current) {
      scrollToBottom()
    }
  }, [runtime.fullText, runtime.pendingText, scrollToBottom])

  if (runtime.state === 'idle') {
    return (
      <div className="rounded-lg bg-card/40 p-8 text-center text-sm text-muted-foreground">
        点击「开始会议」启动实时识别
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="custom-scrollbar h-96 overflow-y-auto rounded-lg bg-card p-4"
    >
      {runtime.finalizedSegments.length === 0 && !runtime.pendingText && (
        <p className="text-sm text-muted-foreground">等待识别结果…</p>
      )}
      {runtime.finalizedSegments.map((seg, idx) => (
        <p key={idx} className="mb-2 text-sm leading-relaxed text-foreground">
          <span className="mr-2 text-xs text-muted-foreground">{formatTime(seg.startSec)}</span>
          {seg.text}
        </p>
      ))}
      {runtime.pendingText && (
        <p className="mb-2 text-sm leading-relaxed text-muted-foreground">
          <span className="mr-2 text-xs text-muted-foreground/60">…</span>
          {runtime.pendingText}
          <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-muted-foreground" />
        </p>
      )}
    </div>
  )
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
