// RAG Tauri command bridge — 与 src-tauri/src/rag/cmd.rs 一一对应
//
// Tauri 2 调用约定：
// - 顶层 invoke 参数（非 struct）：Tauri 自动把 Rust snake_case 转成 JS camelCase
//   （即 `kb_id` 字段前端发 `kbId`，`file_path` → `filePath`，`doc_id` → `docId`）
// - `#[derive(Deserialize)]` struct 内字段：保持 Rust 字段名（snake_case）
//   （即 `request: { top_k, kb_id }`）

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  RAGDocument,
  RAGChunkHit,
  RAGStatus,
  RAGAddTextRequest,
  RAGSearchRequest,
  RAGModelProgressEvent,
} from './types'

const EVT_MODEL_PROGRESS = 'rag-model-progress'

// ─── 状态 ───

/** 初始化/下载嵌入模型（首次会下载 BGE-small-zh-v1.5 量化权重 ~24MB） */
export function ragInitModel() {
  return invoke<void>('rag_init_model')
}

/** 读 RAG 全局状态（开关/Top-K/模型状态/计数/缓存路径） */
export function ragGetStatus() {
  return invoke<RAGStatus>('rag_get_status')
}

/** 设置 RAG 开关与 Top-K。settings 是顶层裸 struct，Tauri 字段转 camelCase */
export function ragSetEnabled(settings: { enabled: boolean; topK: number }) {
  return invoke<void>('rag_set_enabled', { settings })
}

// ─── 文档 CRUD ───

/** 列出指定知识库的全部文档（kbId 可选，默认 'default'，Tauri 把 Rust kb_id 转 camelCase） */
export function ragListDocuments(kbId?: string) {
  return invoke<RAGDocument[]>('rag_list_documents', { kbId: kbId ?? null })
}

/** 添加手动文本；返回新 docId。request 是 #[derive(Deserialize)] struct，字段保留 snake_case */
export function ragAddText(payload: RAGAddTextRequest) {
  return invoke<string>('rag_add_text', {
    request: {
      title: payload.title,
      content: payload.content,
      kb_id: payload.kb_id ?? null,
    },
  })
}

/** 上传一个本地文件（txt/md/pdf）。顶层 String 参数，转 camelCase */
export function ragAddFile(filePath: string) {
  return invoke<string>('rag_add_file', { filePath })
}

/** 删除文档（chunks 通过 CASCADE 一起删除）。顶层 String 参数，转 camelCase */
export function ragDeleteDocument(docId: string) {
  return invoke<void>('rag_delete_document', { docId })
}

// ─── 搜索测试 ───

export function ragSearch(payload: RAGSearchRequest) {
  return invoke<RAGChunkHit[]>('rag_search', {
    request: {
      query: payload.query,
      top_k: payload.top_k ?? null,
      kb_id: payload.kb_id ?? null,
    },
  })
}

// ─── 事件 ───

/** 监听模型下载/初始化进度 */
export function onRagModelProgress(
  handler: (e: RAGModelProgressEvent) => void,
) {
  return listen<RAGModelProgressEvent>(EVT_MODEL_PROGRESS, (ev) => {
    handler(ev.payload)
  })
}
