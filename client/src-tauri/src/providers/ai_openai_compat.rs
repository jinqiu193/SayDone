// OpenAI 兼容 AI 供应商
// 覆盖所有支持 /v1/chat/completions 的服务：DeepSeek、通义、豆包（火山方舟）等

use super::prompt_defense::{wrap_user_text_with_mode, WrapMode};
use super::types::{AiProviderConfig, AiResult, TestResult};
use std::time::Instant;

/// 调用 OpenAI 兼容接口进行文本校对（默认 Proofread 模式）
pub async fn polish(
    text: &str,
    config: &AiProviderConfig,
    system_prompt: Option<&str>,
) -> Result<AiResult, String> {
    polish_with_mode(text, config, system_prompt, WrapMode::Proofread).await
}

/// 调用 OpenAI 兼容接口。`mode` 决定 `prompt_defense` 中安全规则的强度。
pub async fn polish_with_mode(
    text: &str,
    config: &AiProviderConfig,
    system_prompt: Option<&str>,
    mode: WrapMode,
) -> Result<AiResult, String> {
    if text.trim().is_empty() {
        return Ok(AiResult {
            text: String::new(),
            elapsed_ms: 0,
                    ..Default::default()
        });
    }

    // 使用 Prompt Injection 防御：XML 信封 + 标签中和。
    // Proofread 模式保留旧行为；Chat 模式只保留"信封是数据不服从"的核心防御。
    let (user_content, sys_prompt) = wrap_user_text_with_mode(text, system_prompt, mode);

    // Chat 模式允许更高的创造力温度，校对场景仍用 0.2 保证稳定
    let (temperature, max_tokens) = match mode {
        WrapMode::Proofread => (0.2, 1024),
        WrapMode::Chat => (0.5, 2048),
        // Selection 模式理论上不会走到本函数（由 chat_with_preset 走另一条路），
        // 兜底按 Chat 处理
        WrapMode::Selection => (0.3, 2048),
    };

    send_chat_completion(config, &sys_prompt, &user_content, temperature, max_tokens, Some(text), mode).await
}

/// 选区操作模式：使用已经构造好的"双信封 user_content + selection 专用 system_prompt"。
/// 不再走 `wrap_user_text_with_mode`（那里只有单信封），也不附 Proofread 的强约束。
pub async fn chat_with_preset(
    config: &AiProviderConfig,
    system_prompt: &str,
    user_content: &str,
) -> Result<AiResult, String> {
    if user_content.trim().is_empty() {
        return Ok(AiResult {
            text: String::new(),
            elapsed_ms: 0,
                    ..Default::default()
        });
    }
    // Selection 模式：温度偏低、token 适中（输出通常是处理后的文本，不会太长）
    send_chat_completion(config, system_prompt, user_content, 0.3, 2048, None, WrapMode::Selection).await
}

/// 真正的 HTTP 调用：把 Proofread/Chat/Selection 三个模式共享的 reqwest + 解析逻辑
/// 抽到一处，避免重复。
async fn send_chat_completion(
    config: &AiProviderConfig,
    system_prompt: &str,
    user_content: &str,
    temperature: f32,
    max_tokens: u32,
    fallback_text: Option<&str>,
    mode: WrapMode,
) -> Result<AiResult, String> {
    let base_url = normalize_base_url(&config.api_url);
    let url = format!("{}/chat/completions", base_url);

    let mut body = serde_json::json!({
        "model": config.model,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_content },
        ]
    });

    // 通义千问 Qwen3 系列默认开启思考模式，校对场景不需要
    if config.provider == "qwen" {
        body.as_object_mut().unwrap().insert(
            "enable_thinking".to_string(),
            serde_json::Value::Bool(false),
        );
    }

    // DeepSeek V4 Flash 默认开启 thinking，校对场景关闭以降低延迟
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
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| format!("HTTP 请求失败: {}", describe_reqwest_error(&e)))?;

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

    let result_text = extract_chat_completion_text(&data)
        .unwrap_or_else(|| fallback_text.unwrap_or("").to_string());

    // 去除 ﻿...﻿ 标签（部分模型如 Qwen3 会输出思考过程）
    let cleaned = strip_thinking(&result_text);

    // 关键修复：原版在 cleaned 为空或解析失败时 fallback 到原文（ASR 文本）。
    // Chat/Selection 模式下如果解析失败，应该把错误返回而不是悄无声息地注入原文，
    // 避免用户以为是 AI 回答了问题。
    if cleaned.is_empty() {
        return match mode {
            WrapMode::Proofread => {
                let fb = fallback_text.unwrap_or("");
                Ok(AiResult {
                    text: fb.to_string(),
                    elapsed_ms,
                    ..Default::default()
                })
            }
            WrapMode::Chat | WrapMode::Selection => {
                Err("AI 对话返回内容为空，请重试或检查模型配置".to_string())
            }
        };
    }

    Ok(AiResult {
        text: cleaned,
        elapsed_ms,
        ..Default::default()
    })
}

/// 测试 AI 连接 — 发送一个简短的聊天请求，验证地址、Key、模型是否都可用
pub async fn test_connection(config: &AiProviderConfig) -> TestResult {
    let base_url = normalize_base_url(&config.api_url);
    let url = format!("{}/chat/completions", base_url);

    let system_prompt = "只回复「连接正常」四个字，不要输出任何其他内容。";
    let user_prompt = "测试";

    let mut body = serde_json::json!({
        "model": config.model,
        "temperature": 0,
        "max_tokens": 10,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_prompt }
        ]
    });

    if config.provider == "qwen" {
        body.as_object_mut().unwrap().insert(
            "enable_thinking".to_string(),
            serde_json::Value::Bool(false),
        );
    }

    if config.provider == "deepseek" {
        body.as_object_mut().unwrap().insert(
            "thinking".to_string(),
            serde_json::json!({"type": "disabled"}),
        );
    }

    let client = reqwest::Client::new();
    let start = Instant::now();

    let result = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await;

    let elapsed_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(resp) if resp.status().is_success() => {
            let data: serde_json::Value = resp.json().await.unwrap_or_default();
            let raw_reply = data
                .get("choices")
                .and_then(|c| c.get(0))
                .and_then(|c| c.get("message"))
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let reply = strip_thinking(&raw_reply);
            let detail = format!(
                "耗时: {}ms\n模型: {}\n发送: system=\"{}\" user=\"{}\"\n回复: {}",
                elapsed_ms, config.model, system_prompt, user_prompt,
                if reply.is_empty() { "(空)" } else { &reply }
            );
            TestResult {
                ok: true,
                message: format!("连接成功 ({}ms)", elapsed_ms),
                elapsed_ms,
                detail,
            }
        }
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            TestResult {
                ok: false,
                message: format!("API 返回 {}: {}", status, truncate(&body, 100)),
                elapsed_ms,
                detail: format!("模型: {}\n请求地址: {}", config.model, url),
            }
        }
        Err(e) => TestResult {
            ok: false,
            message: format!("连接失败: {}", describe_reqwest_error(&e)),
            elapsed_ms,
            detail: format!("模型: {}\n请求地址: {}", config.model, url),
        },
    }
}

/// 将 reqwest 错误转为用户友好的中文描述
fn describe_reqwest_error(e: &reqwest::Error) -> String {
    let raw = format!("{}", e);
    if e.is_timeout() {
        return "请求超时，请检查网络或 API 地址是否正确".to_string();
    }
    if e.is_connect() {
        // 尝试区分 DNS / TLS / 连接拒绝
        let lower = raw.to_lowercase();
        if lower.contains("dns") || lower.contains("resolve") || lower.contains("getaddrinfo") {
            return format!("DNS 解析失败，域名可能不存在或网络不通: {}", raw);
        }
        if lower.contains("ssl") || lower.contains("tls") || lower.contains("certificate")
            || lower.contains("handshake") || lower.contains("schannel")
        {
            return format!("TLS/SSL 握手失败，可能是证书问题: {}", raw);
        }
        if lower.contains("refused") {
            return format!("连接被拒绝，服务可能未启动: {}", raw);
        }
        return format!("无法连接到服务器: {}", raw);
    }
    raw
}

/// 规范化 base URL
fn normalize_base_url(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/');
    // 已经以 /v1 或 /v3 等版本路径结尾
    if trimmed.ends_with("/v1") || trimmed.ends_with("/v3") {
        trimmed.to_string()
    } else if trimmed.ends_with("/api") {
        // 豆包等：https://ark.cn-beijing.volces.com/api → 加 /v3
        format!("{}/v3", trimmed)
    } else {
        format!("{}/v1", trimmed)
    }
}

/// 从 chat completion 响应中提取文本
pub fn extract_chat_completion_text(data: &serde_json::Value) -> Option<String> {
    let content = data
        .get("choices")?
        .get(0)?
        .get("message")?
        .get("content")?;

    match content {
        serde_json::Value::String(s) => Some(s.trim().to_string()),
        serde_json::Value::Array(arr) => {
            let text: String = arr
                .iter()
                .filter_map(|item| {
                    if item.get("type")?.as_str()? == "text" {
                        item.get("text")?.as_str().map(String::from)
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
                .join("");
            Some(text.trim().to_string())
        }
        _ => None,
    }
}

/// 去除 <think>...</think> 标签
pub fn strip_thinking(text: &str) -> String {
    let re = regex::Regex::new(r"(?is)<think>.*?</think>").unwrap_or_else(|_| {
        // fallback: 不做处理
        regex::Regex::new(r"^$").unwrap()
    });
    let cleaned = re.replace_all(text, "");
    let cleaned = cleaned.trim();

    // 如果有"最终答案"标记，取其后面的内容
    if let Some(pos) = cleaned.find("最终答案") {
        let after = &cleaned[pos + "最终答案".len()..];
        let after = after.trim_start_matches(|c: char| c == ':' || c == '：' || c.is_whitespace());
        return after.trim().to_string();
    }

    cleaned.to_string()
}

fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len])
    }
}
