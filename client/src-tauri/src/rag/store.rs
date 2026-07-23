// RAG 存储 — 直接读写 sqlite（复用 Storage.with_conn）
// 表：rag_documents / rag_chunks

use super::RAGDocument;
use rusqlite::{params, Connection};
use serde_json::Value;
use uuid::Uuid;

/// 列出某知识库下所有文档（按更新时间倒序）
pub fn list_documents(conn: &Connection, kb_id: &str) -> Result<Vec<RAGDocument>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, kb_id, source, source_ref, title, char_count, chunk_count, created_at, updated_at
             FROM rag_documents
             WHERE kb_id = ?1
             ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![kb_id], |row| {
            Ok(RAGDocument {
                id: row.get(0)?,
                kb_id: row.get(1)?,
                source: row.get(2)?,
                source_ref: row.get(3)?,
                title: row.get(4)?,
                char_count: row.get(5)?,
                chunk_count: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.into_iter().collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// 统计某知识库文档数 / chunk 数
pub fn count_stats(conn: &Connection, kb_id: &str) -> Result<(i64, i64), String> {
    let docs: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM rag_documents WHERE kb_id = ?1",
            params![kb_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let chunks: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM rag_chunks WHERE kb_id = ?1",
            params![kb_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok((docs, chunks))
}

/// 插入文档 + 所有 chunks（事务）
/// 返回新文档 id
pub fn insert_document(
    conn: &Connection,
    kb_id: &str,
    source: &str,
    source_ref: Option<&str>,
    title: &str,
    content: &str,
    chunks: &[(String, Vec<f32>)], // (chunk_content, embedding)
) -> Result<String, String> {
    let doc_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let char_count = content.chars().count() as i64;
    let chunk_count = chunks.len() as i64;

    // 用 SAVEPOINT 简单事务
    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    if let Err(e) = conn.execute(
        "INSERT INTO rag_documents (id, kb_id, source, source_ref, title, content, char_count, chunk_count, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![doc_id, kb_id, source, source_ref, title, content, char_count, chunk_count, now, now],
    ) {
        let _ = conn.execute_batch("ROLLBACK");
        return Err(e.to_string());
    }

    let mut stmt = conn
        .prepare(
            "INSERT INTO rag_chunks (id, doc_id, kb_id, chunk_index, content, embedding, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )
        .map_err(|e| e.to_string())?;
    for (idx, (content_text, emb)) in chunks.iter().enumerate() {
        let chunk_id = Uuid::new_v4().to_string();
        let emb_bytes = embedding_to_bytes(emb);
        if let Err(e) = stmt.execute(params![
            chunk_id,
            doc_id,
            kb_id,
            idx as i64,
            content_text,
            emb_bytes,
            now
        ]) {
            drop(stmt);
            let _ = conn.execute_batch("ROLLBACK");
            return Err(e.to_string());
        }
    }
    drop(stmt);

    if let Err(e) = conn.execute_batch("COMMIT") {
        return Err(e.to_string());
    }
    Ok(doc_id)
}

/// 删除文档（chunks 通过 CASCADE 自动删除）
pub fn delete_document(conn: &Connection, doc_id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM rag_documents WHERE id = ?1", params![doc_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 加载所有 chunks（embeddings + 内容 + doc_title）用于内存检索
pub struct ChunkRow {
    pub chunk_id: String,
    pub doc_id: String,
    pub doc_title: String,
    pub chunk_index: i64,
    pub content: String,
    pub embedding: Vec<f32>,
}

pub fn load_all_chunks(conn: &Connection, kb_id: &str) -> Result<Vec<ChunkRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.doc_id, d.title, c.chunk_index, c.content, c.embedding
             FROM rag_chunks c
             JOIN rag_documents d ON d.id = c.doc_id
             WHERE c.kb_id = ?1
             ORDER BY c.doc_id, c.chunk_index",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![kb_id], |row| {
            let emb_bytes: Vec<u8> = row.get(5)?;
            Ok(ChunkRow {
                chunk_id: row.get(0)?,
                doc_id: row.get(1)?,
                doc_title: row.get(2)?,
                chunk_index: row.get(3)?,
                content: row.get(4)?,
                embedding: bytes_to_embedding(&emb_bytes),
            })
        })
        .map_err(|e| e.to_string())?;
    rows.into_iter()
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

/// 读 app_settings 里的 rag.* 键
pub fn read_rag_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value_json FROM app_settings WHERE key = ?1",
        params![key],
        |r| r.get::<_, String>(0),
    )
    .ok()
}

pub fn write_rag_setting(conn: &Connection, key: &str, value: &Value) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp_millis();
    let json_str = serde_json::to_string(value).map_err(|e| e.to_string())?;
    // upsert
    conn.execute(
        "INSERT INTO app_settings (key, value_json, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at",
        params![key, json_str, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// embedding <-> bytes 转换
pub fn embedding_to_bytes(emb: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(emb.len() * 4);
    for f in emb {
        out.extend_from_slice(&f.to_le_bytes());
    }
    out
}

pub fn bytes_to_embedding(bytes: &[u8]) -> Vec<f32> {
    let n = bytes.len() / 4;
    let mut out = Vec::with_capacity(n);
    for i in 0..n {
        let s = &bytes[i * 4..i * 4 + 4];
        out.push(f32::from_le_bytes([s[0], s[1], s[2], s[3]]));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedding_bytes_roundtrip() {
        let emb = vec![1.0f32, -2.5, 3.14159, 0.0];
        let bytes = embedding_to_bytes(&emb);
        let back = bytes_to_embedding(&bytes);
        assert_eq!(emb.len(), back.len());
        for (a, b) in emb.iter().zip(back.iter()) {
            assert!((a - b).abs() < 1e-6);
        }
    }
}
