// Tavily Tauri commands + 内部 augment helper
//
// 设计要点：
// - tavily.* 配置散在 app_settings 表 4 个键：tavily.enabled / tavily.apiKey / tavily.maxResults / tavily.topic
// - cmd 函数对前端的 Storage 抽象；Storage.set/get 已经做了 JSON 序列化
// - augment helper 内部对 ai_chat 调用，失败时静默降级 + log::warn

use log::{info, warn};
use serde_json::Value;
use tauri::State;

use super::search::{format_results_for_prompt, tavily_search, truncate_query};
use super::types::{SearchQuery, SearchResults, TavilyConfig, TavilyStatus};
use crate::storage::Storage;

// ─── settings 读写 ───

fn read_tavily_settings(storage: &Storage) -> TavilyConfig {
    let enabled = storage
        .get("tavily.enabled", None)
        .as_bool()
        .unwrap_or(false);
    let api_key = storage
        .get("tavily.apiKey", None)
        .as_str()
        .unwrap_or("")
        .to_string();
    let max_results = storage
        .get("tavily.maxResults", None)
        .as_u64()
        .unwrap_or(5) as u32;
    let topic = storage
        .get("tavily.topic", None)
        .as_str()
        .unwrap_or("general")
        .to_string();
    TavilyConfig {
        enabled,
        api_key,
        max_results,
        topic,
    }
}

fn write_tavily_settings(storage: &Storage, cfg: &TavilyConfig) -> Result<(), String> {
    storage
        .set("tavily.enabled", &Value::Bool(cfg.enabled))
        .map_err(|e| format!("写 tavily.enabled 失败: {}", e))?;
    storage
        .set("tavily.apiKey", &Value::String(cfg.api_key.clone()))
        .map_err(|e| format!("写 tavily.apiKey 失败: {}", e))?;
    storage
        .set(
            "tavily.maxResults",
            &Value::Number(serde_json::Number::from(cfg.max_results)),
        )
        .map_err(|e| format!("写 tavily.maxResults 失败: {}", e))?;
    storage
        .set("tavily.topic", &Value::String(cfg.topic.clone()))
        .map_err(|e| format!("写 tavily.topic 失败: {}", e))?;
    Ok(())
}

// ─── Tauri commands ───

#[tauri::command]
pub async fn tavily_get_config(storage: State<'_, Storage>) -> Result<TavilyConfig, String> {
    Ok(read_tavily_settings(storage.inner()))
}

#[tauri::command]
pub async fn tavily_set_config(
    config: TavilyConfig,
    storage: State<'_, Storage>,
) -> Result<(), String> {
    write_tavily_settings(storage.inner(), &config)
}

#[tauri::command]
pub async fn tavily_test_search(
    query: SearchQuery,
    storage: State<'_, Storage>,
) -> Result<SearchResults, String> {
    let cfg = read_tavily_settings(storage.inner());
    if cfg.api_key.trim().is_empty() {
        return Err("Tavily API key 未配置，请先在设置中填写".to_string());
    }
    let merged = SearchQuery {
        query: query.query.clone(),
        max_results: query.max_results.or(Some(cfg.max_results)),
        topic: query.topic.or(Some(cfg.topic)),
    };
    let mut results = tavily_search(&cfg.api_key, &merged).await?;
    // 测试搜索阶段不截断，保留原样返回
    results.results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    info!(
        "[tavily] test_search: query={:?} results={} elapsed_ms={}",
        results.query,
        results.results.len(),
        results.elapsed_ms,
    );
    Ok(results)
}

// ─── 内部 helper：给 ai_chat 调用 ───

/// 给定用户输入文本与当前 system_prompt，若 Tavily 启用则联网搜索后追加搜索结果到 prompt 末尾。
///
/// 返回 `(new_prompt, TavilyStatus)`：
/// - 任何失败（Tavily 关、key 空、HTTP 失败）都返回 `(原 prompt, 对应状态)`，**不抛错**，
///   调用方继续走无搜索的 prompt，不影响 LLM 调用。
pub async fn tavily_augment_system_prompt(
    storage: &Storage,
    query_text: &str,
    base_prompt: &str,
) -> (String, TavilyStatus) {
    let cfg = read_tavily_settings(storage);

    if !cfg.enabled {
        return (base_prompt.to_string(), TavilyStatus::NotEnabled);
    }
    if cfg.api_key.trim().is_empty() {
        warn!("[tavily] augment skipped: api_key 为空（用户启用但未填 key）");
        return (base_prompt.to_string(), TavilyStatus::MissingApiKey);
    }

    let q = SearchQuery {
        query: truncate_query(query_text),
        max_results: Some(cfg.max_results.clamp(1, 20)),
        topic: Some(cfg.topic),
    };

    match tavily_search(&cfg.api_key, &q).await {
        Ok(results) => {
            let snippet = format_results_for_prompt(&results);
            if snippet.is_empty() {
                // 搜索成功但 0 条结果，按 Ok 处理但不增加 prompt
                info!(
                    "[tavily] augment ok: results=0 elapsed_ms={}",
                    results.elapsed_ms
                );
                (base_prompt.to_string(), TavilyStatus::Ok)
            } else {
                let augmented = format!(
                    "{}\n\n{}",
                    base_prompt.trim_end(),
                    snippet.trim_end()
                );
                info!(
                    "[tavily] augment ok: results={} elapsed_ms={} new_prompt_len={}",
                    results.results.len(),
                    results.elapsed_ms,
                    augmented.len()
                );
                (augmented, TavilyStatus::Ok)
            }
        }
        Err(e) => {
            warn!("[tavily] augment failed: {} —— 降级到无搜索 prompt", e);
            (base_prompt.to_string(), TavilyStatus::Failed)
        }
    }
}
