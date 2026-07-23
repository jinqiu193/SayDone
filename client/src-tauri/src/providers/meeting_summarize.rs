// 会议纪要总结 — 调用 AI 供应商生成结构化会议纪要
// 与普通 polish/chat 区别：max_tokens=4096，针对会议场景的专用 system prompt

use super::ai_openai_compat;
use super::types::{AiProviderConfig, AiResult};
use std::time::Instant;

const MEETING_SUMMARY_SYSTEM_PROMPT: &str = r#"你是一位专业的会议纪要整理助手。输入是会议录音的原始转写（口语化、有重复、可能有错别字），请输出一份结构化、可直接使用的会议纪要。

【输出格式】
使用 Markdown，包含以下结构：

**会议主题**：根据内容提炼（若不明显写"未明确"）
**日期时间**：从内容中提取（若未提及写"未明确"）
**参会人**：从内容中提取（若未提及写"未明确"）

**议题与决议**：
- 议题 1：(讨论内容)
  - 决议：(如有)
- 议题 2：...

**待办事项**：
- [ ] 负责人 / 截止日期 / 任务内容（按可识别的填写，未提及标注"待确认"）

**遗留问题 / 风险**：
- ...

【原则】
1. 忠实原文：不添加未出现的信息
2. 过滤口语：清除"嗯、啊、那个"等填充词，保留实质内容
3. 提炼精炼：去除重复和冗余，让纪要简洁可读
4. 直接输出纪要本身，不要加"以下是纪要"之类的前缀"#;

/// 调用 AI 总结会议纪要。`max_tokens=4096` 专门为此场景设置。
pub async fn summarize_meeting(
    text: &str,
    config: &AiProviderConfig,
) -> Result<AiResult, String> {
    if text.trim().is_empty() {
        return Ok(AiResult {
            text: String::new(),
            elapsed_ms: 0,
                    ..Default::default()
        });
    }

    let base_url = normalize_base_url(&config.api_url);
    let url = format!("{}/chat/completions", base_url);

    let mut body = serde_json::json!({
        "model": config.model,
        "temperature": 0.3,
        "max_tokens": 4096,
        "messages": [
            { "role": "system", "content": MEETING_SUMMARY_SYSTEM_PROMPT },
            { "role": "user", "content": text },
        ]
    });

    // 通义千问 Qwen3 系列默认开启思考模式，会议总结场景关闭以提升速度
    if config.provider == "qwen" {
        body.as_object_mut().unwrap().insert(
            "enable_thinking".to_string(),
            serde_json::Value::Bool(false),
        );
    }

    // DeepSeek V4 Flash 默认开启 thinking，关闭以降低延迟
    if config.provider == "deepseek" {
        body.as_object_mut().unwrap().insert(
            "thinking".to_string(),
            serde_json::json!({"type": "disabled"}),
        );
    }

    let client = reqwest::Client::new();
    let start = Instant::now();

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(90))  // 长文本 + 大输出，给 90s
        .send()
        .await
        .map_err(|e| format!("HTTP 请求失败: {}", describe_error(&e)))?;

    let elapsed_ms = start.elapsed().as_millis() as u64;

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!("API 返回错误 {}: {}", status, truncate(&body_text, 200)));
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    let result_text = ai_openai_compat::extract_chat_completion_text(&data)
        .unwrap_or_default();
    let cleaned = ai_openai_compat::strip_thinking(&result_text);

    if cleaned.is_empty() {
        return Err("AI 总结返回内容为空".to_string());
    }

    Ok(AiResult {
        text: cleaned,
        elapsed_ms,
        ..Default::default()
    })
}

fn normalize_base_url(api_url: &str) -> String {
    let trimmed = api_url.trim().trim_end_matches('/').to_string();
    if trimmed.ends_with("/v1") {
        trimmed
    } else {
        format!("{}/v1", trimmed)
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max])
    }
}

fn describe_error(e: &reqwest::Error) -> String {
    if e.is_timeout() {
        "请求超时（90s）".to_string()
    } else if e.is_connect() {
        format!("连接失败: {}", e)
    } else {
        format!("{}", e)
    }
}
