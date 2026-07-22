// RAG 检索器 — LRU 缓存 + 内存余弦 top-K
// 设计：v1 不上 HNSW/向量索引；1w chunks × 512 维 ≈ 20MB，单机内存余弦 < 5ms

use super::config::LRU_CAPACITY;
use super::embedder::embed_one;
use super::store;
use super::RAGChunkHit;
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// LRU 缓存条目
struct CacheEntry {
    key: u64,
    hits: Vec<RAGChunkHit>,
    at: u64,
}

static CACHE: once_cell::sync::Lazy<Mutex<Vec<CacheEntry>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(Vec::new()));

fn hash_query(query: &str, kb_id: &str) -> u64 {
    let mut h = DefaultHasher::new();
    query.hash(&mut h);
    kb_id.hash(&mut h);
    h.finish()
}

fn cache_get(key: u64) -> Option<Vec<RAGChunkHit>> {
    let mut guard = CACHE.lock().unwrap();
    if let Some(idx) = guard.iter().position(|e| e.key == key) {
        let entry = &mut guard[idx];
        entry.at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        return Some(entry.hits.clone());
    }
    None
}

fn cache_put(key: u64, hits: Vec<RAGChunkHit>) {
    let mut guard = CACHE.lock().unwrap();
    if let Some(idx) = guard.iter().position(|e| e.key == key) {
        guard[idx].hits = hits;
        return;
    }
    if guard.len() >= LRU_CAPACITY {
        if let Some((idx, _)) = guard.iter().enumerate().min_by_key(|(_, e)| e.at) {
            guard.swap_remove(idx);
        }
    }
    guard.push(CacheEntry {
        key,
        hits,
        at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
    });
}

fn cache_clear() {
    CACHE.lock().unwrap().clear();
}

/// 公共：按 query embedding 取缓存（cmd::retrieve_context_for_chat 用）
pub fn cache_get_by_emb(query_emb: &[f32], kb_id: &str) -> Option<Vec<RAGChunkHit>> {
    // 简单用 query_emb 的前 16 字节做 hash key
    let key = hash_embedding(query_emb, kb_id);
    cache_get(key)
}

pub fn cache_put_by_emb(query_emb: &[f32], kb_id: &str, hits: &[RAGChunkHit]) {
    let key = hash_embedding(query_emb, kb_id);
    cache_put(key, hits.to_vec());
}

fn hash_embedding(emb: &[f32], kb_id: &str) -> u64 {
    let mut h = DefaultHasher::new();
    let n = emb.len().min(8);
    for f in &emb[..n] {
        f.to_bits().hash(&mut h);
    }
    kb_id.hash(&mut h);
    h.finish()
}

/// 余弦相似度（两个同长度向量）— 公共
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot = 0.0f64;
    let mut na = 0.0f64;
    let mut nb = 0.0f64;
    for i in 0..a.len() {
        let x = a[i] as f64;
        let y = b[i] as f64;
        dot += x * y;
        na += x * x;
        nb += y * y;
    }
    let denom = (na.sqrt() * nb.sqrt()).max(1e-9);
    (dot / denom) as f32
}

/// 公共：清空缓存
pub fn clear_cache() {
    cache_clear();
}

/// 公共：按 cache key 写（cmd::retrieve_context_for_chat 用）
pub fn cache_put_for_chat(key: u64, hits: &[RAGChunkHit]) {
    cache_put(key, hits.to_vec());
}

/// 公共：按 cache key 读
pub fn cache_get_for_chat(key: u64) -> Option<Vec<RAGChunkHit>> {
    cache_get(key)
}

/// 公共：当前缓存大小
pub fn cache_size() -> usize {
    CACHE.lock().unwrap().len()
}

/// 公共：把命中的 chunks 拼成 RAG context 字符串
pub fn build_context(hits: &[RAGChunkHit]) -> String {
    if hits.is_empty() {
        return String::new();
    }
    let mut out = String::new();
    for (i, hit) in hits.iter().enumerate() {
        out.push_str(&format!(
            "[{}] 文档：{}（相关度：{:.0}%）\n{}\n\n",
            i + 1,
            hit.doc_title,
            hit.score * 100.0,
            hit.content.trim()
        ));
    }
    out
}

/// 公共：async 包装的 search（cmd::rag_search 用）
pub async fn search(
    storage: &crate::storage::Storage,
    query: &str,
    top_k: usize,
    kb_id: &str,
) -> Result<Vec<RAGChunkHit>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }

    let cache_key = hash_query(q, kb_id);
    if let Some(hits) = cache_get(cache_key) {
        return Ok(hits);
    }

    // embed
    let query_emb = embed_one(q).await.map_err(|e| e.to_string())?;

    // 同步算 score（spawn_blocking）
    let storage = storage.clone();
    let kb_owned = kb_id.to_string();
    let join: tokio::task::JoinHandle<Result<Vec<RAGChunkHit>, String>> =
        tokio::task::spawn_blocking(move || -> Result<Vec<RAGChunkHit>, String> {
            storage.with_conn(|conn| -> Result<Vec<RAGChunkHit>, String> {
                if let Some(hits) = cache_get(cache_key) {
                    return Ok(hits);
                }
                let chunks = match store::load_all_chunks(conn, &kb_owned) {
                    Ok(v) => v,
                    Err(e) => return Err(e),
                };
                if chunks.is_empty() {
                    cache_put(cache_key, Vec::new());
                    return Ok(Vec::new());
                }
                let mut scored: Vec<RAGChunkHit> = chunks
                    .into_iter()
                    .map(|c| RAGChunkHit {
                        score: cosine_similarity(&query_emb, &c.embedding),
                        chunk_id: c.chunk_id,
                        doc_id: c.doc_id,
                        doc_title: c.doc_title,
                        chunk_index: c.chunk_index,
                        content: c.content,
                    })
                    .collect();
                scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
                let hits: Vec<RAGChunkHit> = scored
                    .into_iter()
                    .take(top_k)
                    .filter(|h| h.score > 0.2)
                    .collect();
                cache_put(cache_key, hits.clone());
                Ok(hits)
            })
        });
    let join_result: Result<Result<Vec<RAGChunkHit>, String>, tokio::task::JoinError> =
        join.await;
    match join_result {
        Ok(Ok(v)) => Ok(v),
        Ok(Err(e)) => Err(e),
        Err(e) => Err(format!("spawn_blocking join 失败: {}", e)),
    }
}

#[allow(dead_code)]
fn _unused_hashmap_hint() -> HashMap<(), ()> {
    HashMap::new()
}
