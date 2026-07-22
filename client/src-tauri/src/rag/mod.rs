// RAG 知识库模块 — 纯 Rust 轻量级 RAG
// 包含：
//   - config       全局配置（启用/Top-K/模型状态）
//   - embedder     fastembed BGE-small-zh-v1.5 单例 + 异步包装
//   - chunker      文本分块（段落优先 + 滑动窗口）
//   - store        SQLite 文档/分块 CRUD
//   - ingestion    文件解析（txt/md/pdf）
//   - retriever    检索（LRU 缓存 + 余弦 top-K）
//   - cmd          Tauri commands（8 个）

pub mod chunker;
pub mod cmd;
pub mod config;
pub mod embedder;
pub mod ingestion;
pub mod retriever;
pub mod store;

use serde::{Deserialize, Serialize};

/// RAG 文档（前端展示用）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RAGDocument {
    pub id: String,
    pub kb_id: String,
    pub source: String,        // 'history' | 'meeting' | 'upload' | 'manual'
    pub source_ref: Option<String>,
    pub title: String,
    pub char_count: i64,
    pub chunk_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 检索命中的分块
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RAGChunkHit {
    pub chunk_id: String,
    pub doc_id: String,
    pub doc_title: String,
    pub chunk_index: i64,
    pub content: String,
    pub score: f32,
}

/// RAG 全局状态（前端展示用）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RAGStatus {
    pub enabled: bool,
    pub top_k: i64,
    pub model_status: String, // 'not_initialized' | 'downloading' | 'ready' | 'error'
    pub model_name: String,
    pub doc_count: i64,
    pub chunk_count: i64,
    pub cache_dir: String,
}
