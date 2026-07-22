// RAG 文档摄入 — 解析不同来源的文本
// 支持：手动文本、历史记录转写、会议纪要、文件（txt/md/pdf）

use super::chunker;
use super::embedder;
use super::retriever;
use super::store;
use rusqlite::Connection;
use std::path::Path;
use uuid::Uuid;

/// 文本 → chunks → 嵌入 → 入库
pub async fn ingest_text(
    conn: &Connection,
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

    // 2. 批量 embed
    let texts: Vec<String> = chunks.iter().map(|c| c.content.clone()).collect();
    let embeddings = embedder::embed_async(texts).await?;

    // 3. 入库
    let pairs: Vec<(String, Vec<f32>)> = chunks
        .into_iter()
        .zip(embeddings.into_iter())
        .map(|(c, emb)| (c.content, emb))
        .collect();

    let doc_id = store::insert_document(conn, kb_id, source, source_ref, title, trimmed, &pairs)?;

    // 4. 清缓存
    retriever::clear_cache();
    Ok(doc_id)
}

/// 从文件路径摄入
pub async fn ingest_file(
    conn: &Connection,
    kb_id: &str,
    path: &Path,
) -> Result<String, String> {
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

    let content = match ext.as_str() {
        "txt" | "md" | "markdown" => std::fs::read_to_string(path)
            .map_err(|e| format!("读取文件失败: {}", e))?,
        "pdf" => extract_pdf_text(path)?,
        other => return Err(format!("不支持的文件类型: .{}", other)),
    };

    ingest_text(conn, kb_id, "upload", Some(&file_name), &file_name, &content).await
}

/// 提取 PDF 文本
fn extract_pdf_text(path: &Path) -> Result<String, String> {
    pdf_extract::extract_text(path).map_err(|e| format!("PDF 解析失败: {}", e))
}

/// 从 history 转写构造 RAG 文档内容
pub fn build_history_content(asr_text: &str, llm_text: &str) -> String {
    let mut s = String::new();
    if !asr_text.trim().is_empty() {
        s.push_str("【原始转写】\n");
        s.push_str(asr_text.trim());
        s.push_str("\n\n");
    }
    if !llm_text.trim().is_empty() && llm_text.trim() != asr_text.trim() {
        s.push_str("【AI 整理后】\n");
        s.push_str(llm_text.trim());
    }
    s
}

/// 从会议记录构造 RAG 文档内容
pub fn build_meeting_content(
    meeting_title: Option<&str>,
    meeting_summary: Option<&str>,
    segments: &[(f64, f64, String)], // (startSec, endSec, text)
) -> String {
    let mut s = String::new();
    if let Some(t) = meeting_title {
        if !t.trim().is_empty() {
            s.push_str(&format!("【会议主题】{}\n\n", t.trim()));
        }
    }
    if let Some(sum) = meeting_summary {
        if !sum.trim().is_empty() {
            s.push_str("【AI 会议纪要】\n");
            s.push_str(sum.trim());
            s.push_str("\n\n");
        }
    }
    if !segments.is_empty() {
        s.push_str("【会议转写】\n");
        for (start, end, text) in segments {
            s.push_str(&format!("[{:.0}s - {:.0}s] {}\n", start, end, text.trim()));
        }
    }
    s
}

/// 辅助：构造新 doc id（暂时没用到，store.insert_document 内部生成）
#[allow(dead_code)]
pub fn new_doc_id() -> String {
    Uuid::new_v4().to_string()
}
