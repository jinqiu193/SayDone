// RAG Tauri commands（8 个）
// 关键设计：所有需要 &Connection 的 RAG 操作都是纯同步函数，
// async Tauri command 用 tokio::task::spawn_blocking 包装。
// 这避免在 async 上下文里持有 rusqlite Connection（Connection 非 Send）的问题。

use super::config::{model_cache_dir, EMBED_MODEL_NAME};
use super::{chunker, embedder, store, RAGDocument, RAGStatus};
use crate::storage::Storage;
use rusqlite::Connection;
use serde::Deserialize;
use tauri::{AppHandle, State};

const DEFAULT_KB: &str = "default";

// ─── 1. 初始化嵌入模型 ───
#[tauri::command]
pub async fn rag_init_model(app: AppHandle) -> Result<(), String> {
    embedder::init_embedder(app).await
}

// ─── 2. 读取 RAG 状态 ───
#[tauri::command]
pub async fn rag_get_status(storage: State<'_, Storage>) -> Result<RAGStatus, String> {
    let storage = storage.inner().clone();
    tokio::task::spawn_blocking(move || {
        storage.with_conn(|conn| {
            let enabled = read_bool(conn, "rag.enabled", false);
            let top_k = read_int(conn, "rag.topK", 5);
            let model_status = read_string(conn, "rag.modelStatus", "not_initialized");
            let (docs, chunks) = store::count_stats(conn, DEFAULT_KB).unwrap_or((0, 0));
            let cache_dir_str = model_cache_dir_str();
            Ok(RAGStatus {
                enabled,
                top_k,
                model_status,
                model_name: EMBED_MODEL_NAME.to_string(),
                doc_count: docs,
                chunk_count: chunks,
                cache_dir: cache_dir_str,
            })
        })
    })
    .await
    .map_err(|e| format!("spawn_blocking 失败: {}", e))?
}

// ─── 3. 设置 RAG 开关与 Top-K ───
#[derive(Debug, Deserialize)]
pub struct RagSettings {
    pub enabled: bool,
    pub top_k: i64,
}

#[tauri::command]
pub async fn rag_set_enabled(
    settings: RagSettings,
    storage: State<'_, Storage>,
) -> Result<(), String> {
    let storage = storage.inner().clone();
    tokio::task::spawn_blocking(move || {
        storage.with_conn(|conn| {
            store::write_rag_setting(conn, "rag.enabled", &serde_json::json!(settings.enabled))?;
            store::write_rag_setting(conn, "rag.topK", &serde_json::json!(settings.top_k))?;
            Ok::<(), String>(())
        })
    })
    .await
    .map_err(|e| format!("spawn_blocking 失败: {}", e))?
}

// ─── 4. 列出文档 ───
#[tauri::command]
pub async fn rag_list_documents(
    kb_id: Option<String>,
    storage: State<'_, Storage>,
) -> Result<Vec<RAGDocument>, String> {
    let storage = storage.inner().clone();
    let kb = kb_id.unwrap_or_else(|| DEFAULT_KB.to_string());
    tokio::task::spawn_blocking(move || storage.with_conn(|conn| store::list_documents(conn, &kb)))
        .await
        .map_err(|e| format!("spawn_blocking 失败: {}", e))?
}

// ─── 5. 添加文本（手动） ───
#[derive(Debug, Deserialize)]
pub struct AddTextRequest {
    pub title: String,
    pub content: String,
    pub kb_id: Option<String>,
}

#[tauri::command]
pub async fn rag_add_text(
    request: AddTextRequest,
    storage: State<'_, Storage>,
) -> Result<String, String> {
    if !embedder::is_ready() {
        return Err("嵌入模型未初始化，请先在「知识库」页点击「加载模型」".to_string());
    }
    let kb = request.kb_id.unwrap_or_else(|| DEFAULT_KB.to_string());
    add_text_internal(
        storage.inner(),
        &kb,
        "manual",
        None,
        &request.title,
        &request.content,
    )
    .await
}

// ─── 6. 上传文件 ───
#[tauri::command]
pub async fn rag_add_file(
    filePath: String,
    storage: State<'_, Storage>,
) -> Result<String, String> {
    let ready = embedder::is_ready();
    log::info!("[rag-add-file] is_ready={} filePath={}", ready, filePath);
    if !ready {
        return Err("嵌入模型未初始化，请先加载".to_string());
    }
    let path = std::path::PathBuf::from(&filePath);
    if !path.exists() {
        return Err(format!("文件不存在: {}", filePath));
    }
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    let file_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("未命名文件")
        .to_string();

    // 同步 IO 提取文本
    let content = match ext.as_str() {
        "txt" | "md" | "markdown" => std::fs::read_to_string(&path)
            .map_err(|e| format!("读取文件失败: {}", e))?,
        "pdf" => pdf_extract::extract_text(&path)
            .map_err(|e| format!("PDF 解析失败: {}", e))?,
        other => return Err(format!("不支持的文件类型: .{}", other)),
    };

    add_text_internal(
        storage.inner(),
        DEFAULT_KB,
        "upload",
        Some(&file_name),
        &file_name,
        &content,
    )
    .await
}

// ─── 7. 删除文档 ───
#[tauri::command]
pub async fn rag_delete_document(
    doc_id: String,
    storage: State<'_, Storage>,
) -> Result<(), String> {
    let storage = storage.inner().clone();
    let res: Result<(), String> = tokio::task::spawn_blocking(move || {
        storage.with_conn(|conn| store::delete_document(conn, &doc_id))
    })
    .await
    .map_err(|e| format!("spawn_blocking 失败: {}", e))?;
    super::retriever::clear_cache();
    res
}

// ─── 8. 搜索测试 ───
#[derive(Debug, Deserialize)]
pub struct RagSearchRequest {
    pub query: String,
    pub top_k: Option<i64>,
    pub kb_id: Option<String>,
}

#[tauri::command]
pub async fn rag_search(
    request: RagSearchRequest,
    storage: State<'_, Storage>,
) -> Result<Vec<super::RAGChunkHit>, String> {
    if !embedder::is_ready() {
        return Err("嵌入模型未初始化".to_string());
    }
    let top_k = request.top_k.unwrap_or(5).max(1).min(50) as usize;
    let query = request.query;
    let kb = request.kb_id.unwrap_or_else(|| DEFAULT_KB.to_string());

    super::retriever::search(storage.inner(), &query, top_k, &kb)
        .await
        .map_err(|e| e.to_string())
}

// ─── 内部：添加文本（分块 + embed + 入库）───
// 步骤：embed 是 async（无 conn 借用）→ 然后 spawn_blocking 写库（短期借用 conn）
pub(crate) async fn add_text_internal(
    storage: &Storage,
    kb_id: &str,
    source: &str,
    source_ref: Option<&str>,
    title: &str,
    content: &str,
) -> Result<String, String> {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return Err("内容为空".to_string());
    }
    if trimmed.chars().count() > 200_000 {
        return Err("内容超过 20 万字符上限".to_string());
    }

    // 1. 分块
    let chunks = chunker::split_text(trimmed);
    if chunks.is_empty() {
        return Err("分块结果为空".to_string());
    }

    // 2. embed（async，零 DB 依赖）
    let texts: Vec<String> = chunks.iter().map(|c| c.content.clone()).collect();
    let embeddings = embedder::embed_async(texts).await?;

    // 3. 组装数据，转移所有权到 spawn_blocking
    let pairs: Vec<(String, Vec<f32>)> = chunks
        .into_iter()
        .zip(embeddings.into_iter())
        .map(|(c, e)| (c.content, e))
        .collect();

    let kb_owned = kb_id.to_string();
    let source_owned = source.to_string();
    let source_ref_owned = source_ref.map(|s| s.to_string());
    let title_owned = title.to_string();
    let content_owned = trimmed.to_string();

    // 通过 storage.clone() 共享 Arc<Mutex<Connection>>，在 spawn_blocking 里安全借用
    let storage = storage.clone();
    let doc_id_res: Result<String, String> =
        tokio::task::spawn_blocking(move || {
            storage.with_conn(|conn| {
                store::insert_document(
                    conn,
                    &kb_owned,
                    &source_owned,
                    source_ref_owned.as_deref(),
                    &title_owned,
                    &content_owned,
                    &pairs,
                )
            })
        })
        .await
        .map_err(|e| format!("spawn_blocking 失败: {}", e))?;

    super::retriever::clear_cache();
    doc_id_res
}

// ─── 给 ai_chat 内部调用的接口（不走 Tauri）───

/// 在 ai_chat 中调用：返回拼接好的 RAG context 字符串
/// 步骤：embed query（async）→ spawn_blocking 计算 top-K → 拼 context
pub async fn retrieve_context_for_chat(
    storage: &Storage,
    query: &str,
    top_k: i64,
    kb_id: &str,
) -> Result<Option<String>, String> {
    if !embedder::is_ready() {
        return Ok(None);
    }
    let top_k = top_k.max(1).min(50) as usize;
    let query_trimmed = query.trim().to_string();
    if query_trimmed.is_empty() {
        return Ok(None);
    }
    let query_emb = embedder::embed_one(&query_trimmed).await?;

    // LRU 缓存（按 query 字符串 + kb_id hash）
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    query_trimmed.hash(&mut h);
    kb_id.hash(&mut h);
    let cache_key = h.finish();
    if let Some(hits) = super::retriever::cache_get_for_chat(cache_key) {
        if !hits.is_empty() {
            return Ok(Some(super::retriever::build_context(&hits)));
        }
    }

    let kb_owned = kb_id.to_string();
    let storage = storage.clone();
    let hits: Result<Vec<super::RAGChunkHit>, String> = tokio::task::spawn_blocking(move || {
        storage.with_conn(|conn| -> Result<Vec<super::RAGChunkHit>, String> {
            let chunks = store::load_all_chunks(conn, &kb_owned)?;
            if chunks.is_empty() {
                return Ok(vec![]);
            }
            let mut scored: Vec<super::RAGChunkHit> = chunks
                .into_iter()
                .map(|c| super::RAGChunkHit {
                    score: super::retriever::cosine_similarity(&query_emb, &c.embedding),
                    chunk_id: c.chunk_id,
                    doc_id: c.doc_id,
                    doc_title: c.doc_title,
                    chunk_index: c.chunk_index,
                    content: c.content,
                })
                .collect();
            scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
            let top: Vec<super::RAGChunkHit> = scored
                .into_iter()
                .take(top_k)
                .filter(|h| h.score > 0.2)
                .collect();
            Ok(top)
        })
    })
    .await
    .map_err(|e| format!("spawn_blocking 失败: {}", e))?;

    let hits = hits?;
    if hits.is_empty() {
        return Ok(None);
    }
    // 写缓存
    super::retriever::cache_put_for_chat(cache_key, &hits);
    Ok(Some(super::retriever::build_context(&hits)))
}

// ─── 辅助函数 ───

fn read_bool(conn: &Connection, key: &str, default: bool) -> bool {
    store::read_rag_setting(conn, key)
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.as_bool())
        .unwrap_or(default)
}

fn read_int(conn: &Connection, key: &str, default: i64) -> i64 {
    store::read_rag_setting(conn, key)
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.as_i64())
        .unwrap_or(default)
}

fn read_string(conn: &Connection, key: &str, default: &str) -> String {
    store::read_rag_setting(conn, key)
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| default.to_string())
}

fn model_cache_dir_str() -> String {
    crate::app_paths::models_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}
