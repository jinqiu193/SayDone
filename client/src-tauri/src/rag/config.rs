// RAG 配置 — 跨模块共享路径与设置

use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

/// 嵌入模型缓存目录
pub fn model_cache_dir(app: &AppHandle) -> PathBuf {
    let app_data = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("saydone"));
    app_data.join("models")
}

/// 嵌入模型显示名
pub const EMBED_MODEL_NAME: &str = "BGE-small-zh-v1.5";

/// Embedding 维度（BGE-small-zh-v1.5 = 512；常见文档说 384，但 fastembed 的 BGESmallZHV15 是 512 维）
pub const EMBED_DIM: usize = 512;

/// 默认 Top-K
pub const DEFAULT_TOP_K: i64 = 5;

/// Chunk 大小
pub const CHUNK_SIZE: usize = 300;
pub const CHUNK_OVERLAP: usize = 50;

/// LRU 缓存上限
pub const LRU_CAPACITY: usize = 100;

/// 模型下载进度事件名
pub const EVT_MODEL_PROGRESS: &str = "rag-model-progress";

/// 发送模型下载进度
pub fn emit_model_progress(app: &AppHandle, status: &str, percent: u8, message: &str) {
    let _ = app.emit(
        EVT_MODEL_PROGRESS,
        serde_json::json!({
            "status": status,
            "percent": percent,
            "message": message,
        }),
    );
}
