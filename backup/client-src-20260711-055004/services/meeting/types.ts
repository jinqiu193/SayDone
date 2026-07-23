// 会议纪要 — 类型定义

import type { MeetingSegment } from '../store'

export type MeetingState = 'idle' | 'recording' | 'finalizing' | 'done' | 'error'

/** 会议运行时状态 */
export interface MeetingRuntime {
  state: MeetingState
  /** 当前会议 sessionId（路由 partial 用） */
  sessionId: string
  /** 录音开始时间戳 */
  startTimestamp: number
  /** 录音已经持续的秒数（实时） */
  elapsedSec: number
  /** 当前正在被 partial 刷新的进行中句子（用户看到末尾闪烁的"_"） */
  pendingText: string
  /** 已终结的句子列表 */
  finalizedSegments: MeetingSegment[]
  /** 完整转写（finalizedSegments + pendingText 拼接） */
  fullText: string
  /** 错误信息（state=error 时） */
  errorMessage: string
}
