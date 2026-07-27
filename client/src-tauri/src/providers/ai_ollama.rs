// Ollama AI 供应商
// 调用本地 Ollama 的 /api/generate 接口

use super::prompt_defense::{wrap_user_text_with_mode, WrapMode};
use super::types::{AiProviderConfig, AiResult, TestResult};
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

/// 调用 Ollama 进行文本校对（默认 Proofread 模式）
pub async fn polish(
    text: &str,
    config: &AiProviderConfig,
    system_prompt: Option<&str>,
) -> Result<AiResult, String> {
    polish_with_mode(text, config, system_prompt, WrapMode::Proofread).await
}

/// 调用 Ollama。`mode` 决定 `prompt_defense` 中安全规则的强度。
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

    // Proofread 模式保留旧的"附加安全规则 + 校对助手身份"，Chat 模式只保留信封防御。
    let (user_content, sys_prompt) = wrap_user_text_with_mode(text, system_prompt, mode);
    send_ollama_generate(config, &sys_prompt, &user_content, Some(text), mode).await
}

/// 选区操作模式：使用已经构造好的"双信封 user_content + selection 专用 system_prompt"。
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
    send_ollama_generate(config, system_prompt, user_content, None, WrapMode::Selection).await
}

async fn send_ollama_generate(
    config: &AiProviderConfig,
    system_prompt: &str,
    user_content: &str,
    fallback_text: Option<&str>,
    mode: WrapMode,
) -> Result<AiResult, String> {
    let url = normalize_url(&config.api_url);
    let combined = format!("{}\n\n请处理以下内容：\n\n{}", system_prompt, user_content);

    let model = if config.model.is_empty() {
        "qwen2.5:7b"
    } else {
        &config.model
    };

    let body = serde_json::json!({
        "model": model,
        "stream": false,
        "prompt": combined
    });

    let client = reqwest::Client::new();
    let start = Instant::now();

    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(90))
        .send()
        .await
        .map_err(|e| format!("Ollama 请求失败: {}", e))?;

    let elapsed_ms = start.elapsed().as_millis() as u64;

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama 返回错误 {}: {}", status, truncate(&body_text, 200)));
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析 Ollama 响应失败: {}", e))?;

    let result_text = data
        .get("response")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    // Chat/Selection 模式下，解析失败或空结果不应 fallback 到原文欺骗用户。
    if result_text.is_empty() {
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
        text: result_text,
        elapsed_ms,
        ..Default::default()
    })
}

/// 测试 Ollama 连接 — 实际调用模型，验证模型是否可用
pub async fn test_connection(config: &AiProviderConfig) -> TestResult {
    let url = normalize_url(&config.api_url);

    let model = if config.model.is_empty() {
        "qwen2.5:7b"
    } else {
        &config.model
    };

    let prompt = "只回复「连接正常」四个字，不要输出任何其他内容。";

    let body = serde_json::json!({
        "model": model,
        "stream": false,
        "prompt": prompt
    });

    let client = reqwest::Client::new();
    let start = Instant::now();

    let result = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await;

    let elapsed_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(resp) if resp.status().is_success() => {
            let data: serde_json::Value = resp.json().await.unwrap_or_default();
            let reply = data
                .get("response")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let detail = format!(
                "耗时: {}ms\n模型: {}\n发送: \"{}\"\n回复: {}",
                elapsed_ms, model, prompt,
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
            let body_text = resp.text().await.unwrap_or_default();
            TestResult {
                ok: false,
                message: format!("Ollama 返回 {} : {}", status, truncate(&body_text, 100)),
                elapsed_ms,
                detail: format!("模型: {}\n请求地址: {}", model, url),
            }
        }
        Err(e) => TestResult {
            ok: false,
            message: format!("连接失败: {}", e),
            elapsed_ms,
            detail: format!("模型: {}\n请求地址: {}", model, url),
        },
    }
}

/// 调用 Ollama 进行会议纪要总结
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

    let url = normalize_url(&config.api_url);
    let combined = format!("{}\n\n请处理以下会议内容：\n\n{}", MEETING_SUMMARY_SYSTEM_PROMPT, text);

    let model = if config.model.is_empty() {
        "qwen2.5:7b"
    } else {
        &config.model
    };

    let body = serde_json::json!({
        "model": model,
        "stream": false,
        "prompt": combined
    });

    let client = reqwest::Client::new();
    let start = Instant::now();

    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| format!("Ollama 请求失败: {}", e))?;

    let elapsed_ms = start.elapsed().as_millis() as u64;

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama 返回错误 {}: {}", status, truncate(&body_text, 200)));
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析 Ollama 响应失败: {}", e))?;

    let result_text = data
        .get("response")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    if result_text.is_empty() {
        return Err("Ollama 会议总结返回内容为空".to_string());
    }

    Ok(AiResult {
        text: result_text,
        elapsed_ms,
        ..Default::default()
    })
}

fn normalize_url(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/');
    if trimmed.ends_with("/api/generate") {
        trimmed.to_string()
    } else if trimmed.ends_with("/api") {
        format!("{}/generate", trimmed)
    } else {
        format!("{}/api/generate", trimmed)
    }
}

fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len])
    }
}
