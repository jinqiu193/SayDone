// MiniMax 语音识别（ASR）供应商
// 接口：POST https://api.minimax.cn/v1/speech_to_text
// multipart/form-data: model=asr-1.0, file=@audio.wav, response_format=json, stream=false
// 非流式：一次性返回 application/json { "text": "...", "duration": ... }
//
// 官方约束：单次音频 ≤500 秒、≤50MB；不支持裸 PCM，必须带容器 → 这里统一封装 WAV。
// MiniMax 分国内站 / 海外站，域名不同；默认地址不可达或返回 404 时自动回退到备用地址，
// 也可通过 AsrProviderConfig.extra.base_url 直接指定。
// 模型名可通过 AsrProviderConfig.extra.model 覆盖，默认 asr-1.0

use super::types::{AsrProviderConfig, AsrResult, TestResult};
use std::time::Instant;

const DEFAULT_URL: &str = "https://api.minimax.cn/v1/speech_to_text";
const DEFAULT_MODEL: &str = "asr-1.0";
/// 默认域名不可达时的回退地址（国内站 / 海外站）
const FALLBACK_URLS: [&str; 2] = [
    "https://api.minimaxi.com/v1/speech_to_text",
    "https://api.minimax.io/v1/speech_to_text",
];

fn extra_str(config: &AsrProviderConfig, key: &str) -> Option<String> {
    config
        .extra
        .as_object()
        .and_then(|o| o.get(key))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn resolve_model(config: &AsrProviderConfig) -> String {
    extra_str(config, "model").unwrap_or_else(|| DEFAULT_MODEL.to_string())
}

/// 候选接口地址：自定义 > 默认 > 回退（去重后按序尝试）
fn resolve_urls(config: &AsrProviderConfig) -> Vec<String> {
    let mut urls: Vec<String> = Vec::new();
    let mut push = |u: String| {
        if !urls.contains(&u) {
            urls.push(u);
        }
    };
    if let Some(custom) = extra_str(config, "base_url") {
        push(custom);
    }
    push(DEFAULT_URL.to_string());
    for u in FALLBACK_URLS {
        push(u.to_string());
    }
    urls
}

fn pcm_to_wav(pcm_data: &[u8], sample_rate: u32) -> Vec<u8> {
    let num_channels: u16 = 1;
    let bits_per_sample: u16 = 16;
    let byte_rate = sample_rate * u32::from(num_channels) * u32::from(bits_per_sample) / 8;
    let block_align = num_channels * bits_per_sample / 8;
    let data_size = pcm_data.len() as u32;
    let file_size = 36 + data_size;

    let mut wav = Vec::with_capacity(44 + pcm_data.len());
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&file_size.to_le_bytes());
    wav.extend_from_slice(b"WAVE");
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&num_channels.to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&block_align.to_le_bytes());
    wav.extend_from_slice(&bits_per_sample.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_size.to_le_bytes());
    wav.extend_from_slice(pcm_data);
    wav
}

fn build_form(model: &str, wav: Vec<u8>) -> Result<reqwest::multipart::Form, String> {
    let part = reqwest::multipart::Part::bytes(wav)
        .file_name("audio.wav")
        .mime_str("audio/wav")
        .map_err(|e| format!("构建文件 part 失败: {}", e))?;
    Ok(reqwest::multipart::Form::new()
        .text("model", model.to_string())
        .text("response_format", "json")
        .text("stream", "false")
        .text("timestamp_level", "word")
        .part("file", part))
}

/// 解析非流式 JSON 响应：正常时取 `text`，平台错误走 base_resp
fn parse_text(body: &str) -> Result<String, String> {
    let value: serde_json::Value = serde_json::from_str(body)
        .map_err(|e| format!("解析响应失败: {} ({})", e, truncate(body, 200)))?;

    if let Some(base) = value.get("base_resp") {
        let code = base.get("status_code").and_then(|c| c.as_i64()).unwrap_or(0);
        if code != 0 {
            let msg = base
                .get("status_msg")
                .and_then(|m| m.as_str())
                .unwrap_or("未知错误");
            return Err(format!("MiniMax ASR 服务端错误 {}: {}", code, truncate(msg, 300)));
        }
    }

    if let Some(t) = value.get("text").and_then(|v| v.as_str()) {
        return Ok(t.to_string());
    }

    if let Some(error) = value.get("error") {
        let msg = error
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("未知错误");
        return Err(format!("MiniMax ASR 服务端错误: {}", truncate(msg, 300)));
    }

    Err(format!("MiniMax ASR 响应缺少 text 字段: {}", truncate(body, 200)))
}

pub async fn transcribe(
    audio_pcm_b64: &str,
    sample_rate: u32,
    config: &AsrProviderConfig,
    _hotwords: &[String],
) -> Result<AsrResult, String> {
    eprintln!(
        "[asr_minimax] transcribe called: model={} api_key_len={} pcm_b64_len={} sample_rate={}",
        resolve_model(config),
        config.api_key.len(),
        audio_pcm_b64.len(),
        sample_rate,
    );

    let pcm_data = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        audio_pcm_b64,
    )
    .map_err(|e| format!("base64 解码失败: {}", e))?;

    if pcm_data.is_empty() {
        return Ok(AsrResult {
            text: String::new(),
            elapsed_ms: 0,
        });
    }

    let api_key = &config.api_key;
    if api_key.is_empty() {
        return Err("MiniMax API Key 不能为空".to_string());
    }

    let wav_data = pcm_to_wav(&pcm_data, sample_rate);
    let model = resolve_model(config);
    let urls = resolve_urls(config);
    let client = reqwest::Client::new();
    let start = Instant::now();

    for (idx, url) in urls.iter().enumerate() {
        let form = build_form(&model, wav_data.clone())?;
        let resp = client
            .post(url)
            .header("Authorization", format!("Bearer {}", api_key))
            .multipart(form)
            .timeout(std::time::Duration::from_secs(60))
            .send()
            .await;

        match resp {
            Ok(resp) => {
                let status = resp.status();
                if status.is_success() {
                    let body = resp
                        .text()
                        .await
                        .map_err(|e| format!("读取响应失败: {}", e))?;
                    let text = parse_text(&body)?;
                    let elapsed_ms = start.elapsed().as_millis() as u64;
                    eprintln!(
                        "[asr_minimax] 识别完成 elapsed_ms={} text_len={}",
                        elapsed_ms,
                        text.len()
                    );
                    return Ok(AsrResult { text, elapsed_ms });
                }

                let body = resp.text().await.unwrap_or_default();
                // 404 视为域名/路径不可用，尝试下一个候选地址
                if status == reqwest::StatusCode::NOT_FOUND && idx + 1 < urls.len() {
                    eprintln!("[asr_minimax] {} 返回 404，尝试回退地址", url);
                    continue;
                }
                return Err(format!(
                    "MiniMax ASR 请求失败 HTTP {}: {}",
                    status,
                    truncate(&body, 300)
                ));
            }
            Err(e) => {
                // 连接层失败（DNS/网络）同样尝试下一个候选地址
                if idx + 1 < urls.len() {
                    eprintln!("[asr_minimax] {} 连接失败：{}，尝试回退地址", url, e);
                    continue;
                }
                return Err(format!("MiniMax ASR 请求失败: {}", e));
            }
        }
    }

    Err("MiniMax ASR 请求失败: 所有候选接口地址均不可用".to_string())
}

pub async fn test_connection(config: &AsrProviderConfig) -> TestResult {
    // 1 秒静音 WAV：只验证鉴权与接口可达
    let silence = vec![0u8; 16000];
    let wav = pcm_to_wav(&silence, 16000);

    let api_key = &config.api_key;
    let model = resolve_model(config);
    let urls = resolve_urls(config);
    let client = reqwest::Client::new();
    let start = Instant::now();

    for (idx, url) in urls.iter().enumerate() {
        let form = match build_form(&model, wav.clone()) {
            Ok(f) => f,
            Err(e) => {
                return TestResult {
                    ok: false,
                    message: e,
                    elapsed_ms: start.elapsed().as_millis() as u64,
                    detail: String::new(),
                }
            }
        };

        let result = client
            .post(url)
            .header("Authorization", format!("Bearer {}", api_key))
            .multipart(form)
            .timeout(std::time::Duration::from_secs(30))
            .send()
            .await;

        let elapsed_ms = start.elapsed().as_millis() as u64;
        match result {
            Ok(resp) => {
                if resp.status().is_success() {
                    return TestResult {
                        ok: true,
                        message: format!("连接成功 ({}ms)", elapsed_ms),
                        elapsed_ms,
                        detail: String::new(),
                    };
                }
                if resp.status() == reqwest::StatusCode::NOT_FOUND && idx + 1 < urls.len() {
                    continue;
                }
                let body = resp.text().await.unwrap_or_default();
                return TestResult {
                    ok: false,
                    message: format!("API 错误: {}", truncate(&body, 100)),
                    elapsed_ms,
                    detail: String::new(),
                };
            }
            Err(e) => {
                if idx + 1 < urls.len() {
                    continue;
                }
                return TestResult {
                    ok: false,
                    message: format!("连接失败: {}", e),
                    elapsed_ms,
                    detail: String::new(),
                };
            }
        }
    }

    TestResult {
        ok: false,
        message: "连接失败: 所有候选接口地址均不可用".to_string(),
        elapsed_ms: start.elapsed().as_millis() as u64,
        detail: String::new(),
    }
}

fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        return s.to_string();
    }
    // 服务端错误信息可能含中文，按字符边界截断避免 panic
    let end = s
        .char_indices()
        .take_while(|(i, _)| *i < max_len)
        .last()
        .map(|(i, c)| i + c.len_utf8())
        .unwrap_or(0);
    format!("{}...", &s[..end])
}