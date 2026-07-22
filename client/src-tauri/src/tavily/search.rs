// Tavily 联网搜索 HTTP 调用层
// - 单例 reqwest::Client（15s 超时）
// - 调用失败返回 Err(String) 让上层决定降级策略

use once_cell::sync::Lazy;
use std::sync::Arc;
use std::time::Instant;

use super::types::{SearchQuery, SearchResults, SearchResultItem};

pub static HTTP: Lazy<Arc<reqwest::Client>> = Lazy::new(|| {
    Arc::new(
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .expect("tavily: failed to build reqwest client"),
    )
});

const TAVILY_ENDPOINT: &str = "https://api.tavily.com/search";

/// 调 Tavily /search，成功返回结构化结果，失败返回中文错误描述。
///
/// `api_key`：用户填入的 Tavily key（不要写死！使用方必须从配置读取）
pub async fn tavily_search(api_key: &str, q: &SearchQuery) -> Result<SearchResults, String> {
    if api_key.trim().is_empty() {
        return Err("Tavily API key 为空".to_string());
    }
    let max_results = q.max_results.unwrap_or(5).clamp(1, 20);
    let topic = q.topic.as_deref().unwrap_or("general");
    if topic != "general" && topic != "news" {
        return Err(format!("不支持的 topic: {}（仅 general/news）", topic));
    }

    let body = serde_json::json!({
        "query": q.query,
        "max_results": max_results,
        "topic": topic,
        // 用 API 默认 search_depth / include_raw_content，先不引入更多参数
    });

    let start = Instant::now();
    let resp = HTTP
        .post(TAVILY_ENDPOINT)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Tavily 请求失败: {}", describe_reqwest_error(&e)))?;

    let elapsed_ms = start.elapsed().as_millis() as u64;

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Tavily API 返回错误 {}: {}",
            status,
            truncate(&body_text, 240)
        ));
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析 Tavily 响应失败: {}", e))?;

    // results 是数组
    let raw_results = data
        .get("results")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut items = Vec::with_capacity(raw_results.len());
    for v in raw_results {
        let title = v
            .get("title")
            .and_then(|s| s.as_str())
            .unwrap_or("")
            .to_string();
        let url = v
            .get("url")
            .and_then(|s| s.as_str())
            .unwrap_or("")
            .to_string();
        let content = v
            .get("content")
            .and_then(|s| s.as_str())
            .unwrap_or("")
            .to_string();
        let score = v.get("score").and_then(|s| s.as_f64()).unwrap_or(0.0) as f32;
        if title.is_empty() && url.is_empty() && content.is_empty() {
            continue;
        }
        items.push(SearchResultItem {
            title,
            url,
            content,
            score,
        });
    }

    Ok(SearchResults {
        query: q.query.clone(),
        results: items,
        elapsed_ms,
    })
}

fn describe_reqwest_error(e: &reqwest::Error) -> String {
    let raw = format!("{}", e);
    if e.is_timeout() {
        return "请求超时".to_string();
    }
    if e.is_connect() {
        let lower = raw.to_lowercase();
        if lower.contains("dns") || lower.contains("resolve") || lower.contains("getaddrinfo") {
            return format!("DNS 解析失败: {}", raw);
        }
        if lower.contains("ssl") || lower.contains("tls") || lower.contains("handshake") {
            return format!("TLS 握手失败: {}", raw);
        }
        return format!("无法连接: {}", raw);
    }
    raw
}

fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        // 注意：截断在 UTF-8 字符边界上，避免 panic
        let mut end = max_len;
        while end > 0 && !s.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}...", &s[..end])
    }
}

/// 把 SearchResults 格式化成可拼接到 system_prompt 末尾的 markdown 列表。
/// 每个 result 的 content 截到 600 chars，总长度超过 12k chars 时裁掉最早条目。
pub fn format_results_for_prompt(r: &SearchResults) -> String {
    if r.results.is_empty() {
        return String::new();
    }
    const PER_RESULT_MAX: usize = 600;
    const TOTAL_MAX: usize = 12_000;

    let mut out = String::new();
    out.push_str("【实时联网搜索结果】\n");
    out.push_str(
        "（以下内容来自 Tavily 联网搜索，可作为时效性上下文参考；如与问题无关或时效性不强可忽略。）\n\n",
    );

    let mut total_len = out.len();
    let mut kept_any = false;
    let mut skipped = 0_usize;
    // 从后往前填，遇到超长时砍掉前面的（保留最新）
    let mut selected: Vec<String> = Vec::new();
    for item in r.results.iter().rev() {
        let snippet = format!(
            "- {}。\n  {}\n  URL: {}\n",
            item.title.trim(),
            truncate(&item.content, PER_RESULT_MAX).trim(),
            item.url.trim(),
        );
        if total_len + snippet.len() > TOTAL_MAX {
            skipped += 1;
            continue;
        }
        total_len += snippet.len();
        selected.push(snippet);
    }
    selected.reverse();
    kept_any = !selected.is_empty();

    for s in selected {
        out.push_str(&s);
    }
    if skipped > 0 {
        out.push_str(&format!(
            "\n（另有 {} 条结果因超长被省略）\n",
            skipped
        ));
    }
    if !kept_any {
        return String::new();
    }
    out
}

/// 截断 query 文本：≤ 500 chars 直接用；> 500 chars 取头 400 + 尾 100
pub fn truncate_query(s: &str) -> String {
    let len = s.chars().count();
    if len <= 500 {
        return s.to_string();
    }
    let head: String = s.chars().take(400).collect();
    let tail: String = {
        let chars_total = s.chars().count();
        s.chars().skip(chars_total.saturating_sub(100)).collect()
    };
    format!("{}…{}（已截断，原文 {} 字）", head, tail, len)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate_query_short_passthrough() {
        let q = "你好世界";
        assert_eq!(truncate_query(q), "你好世界");
    }

    #[test]
    fn truncate_query_long_takes_head_tail() {
        let s: String = "x".repeat(800);
        let out = truncate_query(&s);
        // 头 400 + … + 尾 100 + 元信息
        assert!(out.starts_with(&"x".repeat(50)));
        assert!(out.contains("已截断"));
        assert!(out.contains("800"));
    }

    #[test]
    fn format_results_empty() {
        let r = SearchResults {
            query: "x".into(),
            results: vec![],
            elapsed_ms: 1,
        };
        assert_eq!(format_results_for_prompt(&r), "");
    }
}
