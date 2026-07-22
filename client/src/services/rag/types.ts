// RAG (Retrieval-Augmented Generation) — TS 类型，对应 Rust 端定义
// 与 client/src-tauri/src/rag/mod.rs 中的 RAGDocument / RAGChunkHit / RAGStatus 保持一致

export type RAGSource = 'history' | 'meeting' | 'upload' | 'manual'

export interface RAGDocument {
  id: string
  kb_id: string
  source: RAGSource
  source_ref: string | null
  title: string
  /** 完整原文；列表页可省略，详情/编辑时才需要 */
  content?: string
  char_count: number
  chunk_count: number
  /** Unix millis */
  created_at: number
  /** Unix millis */
  updated_at: number
}

export interface RAGChunkHit {
  chunk_id: string
  doc_id: string
  doc_title: string
  chunk_index: number
  content: string
  /** 0-1 cosine 相似度 */
  score: number
}

export type RAGModelStatus =
  | 'not_initialized'
  | 'downloading'
  | 'ready'
  | 'error'

export interface RAGStatus {
  enabled: boolean
  top_k: number
  model_status: RAGModelStatus
  model_name: string
  doc_count: number
  chunk_count: number
  cache_dir: string
}

export interface RAGAddTextRequest {
  title: string
  content: string
  kb_id?: string
}

export interface RAGSearchRequest {
  query: string
  top_k?: number
  kb_id?: string
}

/** 来源在 UI 上用 emoji + 文字标签呈现 */
export const SOURCE_LABELS: Record<RAGSource, { emoji: string; label: string }> = {
  history: { emoji: '🎙', label: '历史' },
  meeting: { emoji: '📋', label: '会议' },
  upload:  { emoji: '📄', label: '上传' },
  manual:  { emoji: '✏️', label: '手动' },
}

export interface RAGModelProgressEvent {
  /** 0-100 */
  percent?: number
  /** 状态文字描述 */
  message?: string
  /** 当前阶段 */
  stage?: 'downloading' | 'extracting' | 'ready' | 'error'
}
