// 转写 Provider 抽象层类型定义
// 所有工作模式（云 API / 本地）共享此接口

import type { ActiveAppContext } from '../../types/appContext'
import type { ClientRuntimeInfo } from '../../types/appApi'

export type WorkMode = 'cloud_api' | 'local'

export type ProviderState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface ASRResult {
  text: string
  asrMs: number
  durationSec: number
}

export interface FinalResult {
  asrText: string
  llmText: string
  asrMs: number
  llmMs: number
  durationSec: number
  asrEngine?: string
  asrModel?: string
}

export interface TranscriptionCallbacks {
  onStateChange?: (state: ProviderState) => void
  onReady?: (info: { connectionId?: string; asr: boolean; llm: boolean }) => void
  onASR?: (result: ASRResult) => void
  /** 流式 partial 文本推送（会议纪要场景使用）。isFinal=true 表示该句已终结，false 表示仍在被刷新 */
  onPartial?: (text: string, isFinal: boolean) => void
  onFinal?: (result: FinalResult) => void
  onDone?: () => void
  onError?: (msg: string) => void
}

export interface StartOptions {
  systemPrompt?: string
  disableAi?: boolean
  clientMeta?: ClientRuntimeInfo | null
  appContext?: ActiveAppContext | null
  source?: 'live' | 'history_reprocess'
  hotwords?: string[]
  language?: string
  /**
   * AI 润色风格（场景化）
   * - auto：由 AppContext 自动推断（推荐）
   * - casual：聊天口语（微信/QQ/Slack/Discord 等）
   * - standard：通用书面
   * - formal：正式书面（邮件/WORD/文档 等）
   * - code：开发者（保留英文变量名/命令/技术名词）
   * - email：邮件（敬语/落款/段落规范）
   * - note：笔记（Notion/Obsidian/Typora 等）
   */
  polishStyle?: 'auto' | 'casual' | 'standard' | 'formal' | 'code' | 'email' | 'note'
}

export interface StopOptions {
  pttHoldMs?: number
  audioStats?: {
    avgRms: number
    peakRms: number
    peakAmplitude: number
    silenceRatio: number
    totalFrames: number
  }
}

/**
 * 转写 Provider 接口。
 * RecorderOrchestrator 通过此接口与具体的转写实现交互，
 * 不再直接依赖 WebSocket 或任何特定的后端协议。
 */
export interface TranscriptionProvider {
  readonly mode: WorkMode

  /** 建立连接 / 初始化 */
  connect(callbacks: TranscriptionCallbacks): Promise<void>

  /** 开始一次转写会话 */
  start(opts?: StartOptions): boolean

  /** 发送音频数据（流式，PCM Int16 ArrayBuffer） */
  sendAudio(buffer: ArrayBuffer): void

  /** 结束录音，触发处理 */
  stop(opts?: StopOptions): boolean

  /** 断开连接 / 释放资源 */
  disconnect(): void

  /** 是否已就绪可以开始转写 */
  isReady(): boolean
}
