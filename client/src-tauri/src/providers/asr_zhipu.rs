// 智谱 GLM-ASR 供应商
// 接口：POST https://open.bigmodel.cn/api/paas/v4/audio/transcriptions
// multipart/form-data: model=glm-asr-2512, stream=true, file=@audio
// stream=true 时服务端以 SSE（data: {json} 行，data: [DONE] 结束）逐块返回识别内容，
// 相比 stream=false 一次性返回，首块更快、整体延迟更低。
// 模型名可在 AsrProviderConfig.extra.model 中覆盖，默认 glm-asr-2512

use super::types::{AsrProviderConfig, AsrResult, TestResult};
use futures_util::StreamExt;
use std::time::Instant;

const TRANSCRIBE_URL: &str = "https://open.bigmodel.cn/api/paas/v4/audio/transcriptions";
const DEFAULT_MODEL: &str = "glm-asr-2512";

fn resolve_model(config: &AsrProviderConfig) -> String {
    config
        .extra
        .as_object()
        .and_then(|o| o.get("model"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL.to_string())
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

pub async fn transcribe(
    audio_pcm_b64: &str,
    sample_rate: u32,
    config: &AsrProviderConfig,
    _hotwords: &[String],
) -> Result<AsrResult, String> {
    eprintln!(
        "[asr_zhipu] transcribe called: model={} api_key_len={} pcm_b64_len={} sample_rate={}",
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

    let wav_data = pcm_to_wav(&pcm_data, sample_rate);

    let api_key = &config.api_key;
    if api_key.is_empty() {
        return Err("智谱 API Key 不能为空".to_string());
    }

    let client = reqwest::Client::new();
    let start = Instant::now();

    let form = reqwest::multipart::Form::new()
        .text("model", resolve_model(config))
        .text("stream", "true")
        .part(
            "file",
            reqwest::multipart::Part::bytes(wav_data)
                .file_name("audio.wav")
                .mime_str("audio/wav")
                .map_err(|e| format!("构建文件 part 失败: {}", e))?,
        );

    let resp = client
        .post(TRANSCRIBE_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| {
            eprintln!("[asr_zhipu] HTTP 请求失败: {}", e);
            format!("HTTP 请求失败: {}", e)
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!(
            "智谱 ASR 请求失败 HTTP {}: {}",
            status,
            truncate(&body_text, 300)
        ));
    }

    // 解析 SSE 流：每行 `data: {json}`，`data: [DONE]` 表示结束。
    // 逐块累加识别文本，块格式兼容 text / delta / choices[0].delta.content 三种字段。
    let mut stream = resp.bytes_stream();
    let mut text = String::new();
    let mut buf: Vec<u8> = Vec::new();
    let mut done = false;
    while !done {
        match stream.next().await {
            Some(Ok(chunk)) => {
                buf.extend_from_slice(&chunk);
                // 按行切分（SSE 行以 \n 结束）
                loop {
                    match buf.iter().position(|&b| b == b'\n') {
                        Some(pos) => {
                            let line: Vec<u8> = buf.drain(..=pos).collect();
                            let line_str = String::from_utf8_lossy(&line).trim().to_string();
                            if let Some(payload) = line_str.strip_prefix("data:") {
                                let payload = payload.trim();
                                if payload == "[DONE]" {
                                    done = true;
                                    break;
                                }
                                if let Ok(value) = serde_json::from_str::<serde_json::Value>(payload)
                                {
                                    if let Some(t) = value.get("text").and_then(|v| v.as_str()) {
                                        text.push_str(t);
                                    } else if let Some(d) = value.get("delta").and_then(|v| v.as_str())
                                    {
                                        text.push_str(d);
                                    } else if let Some(content) = value
                                        .get("choices")
                                        .and_then(|c| c.get(0))
                                        .and_then(|c| c.get("delta"))
                                        .and_then(|d| d.get("content"))
                                        .and_then(|v| v.as_str())
                                    {
                                        text.push_str(content);
                                    }
                                }
                            }
                        }
                        None => break,
                    }
                }
            }
            Some(Err(e)) => {
                return Err(format!("读取智谱流式响应失败: {}", e));
            }
            None => break,
        }
    }

    let elapsed_ms = start.elapsed().as_millis() as u64;

    // 兜底：若流式解析未得到文本（如服务端按普通 JSON 返回），尝试整体解析
    if text.is_empty() && !buf.is_empty() {
        let body_str = String::from_utf8_lossy(&buf).trim().to_string();
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&body_str) {
            if let Some(t) = value.get("text").and_then(|v| v.as_str()) {
                text = t.to_string();
            } else if let Some(error) = value.get("error") {
                let msg = error
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("未知错误");
                return Err(format!("智谱 ASR 服务端错误: {}", truncate(msg, 300)));
            }
        }
    }

    eprintln!(
        "[asr_zhipu] SSE 流结束 elapsed_ms={} text_len={}",
        elapsed_ms,
        text.len()
    );

    Ok(AsrResult { text, elapsed_ms })
}

pub async fn test_connection(config: &AsrProviderConfig) -> TestResult {
    let silence = vec![0u8; 16000];
    let wav = pcm_to_wav(&silence, 16000);

    let api_key = &config.api_key;
    let client = reqwest::Client::new();
    let start = Instant::now();

    let part = match reqwest::multipart::Part::bytes(wav.clone())
        .file_name("audio.wav")
        .mime_str("audio/wav")
    {
        Ok(p) => p,
        Err(_) => reqwest::multipart::Part::bytes(wav),
    };

    let form = reqwest::multipart::Form::new()
        .text("model", resolve_model(config))
        .text("stream", "false")
        .part("file", part);

    let result = client
        .post(TRANSCRIBE_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await;

    let elapsed_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(resp) => {
            if resp.status().is_success() {
                TestResult {
                    ok: true,
                    message: format!("连接成功 ({}ms)", elapsed_ms),
                    elapsed_ms,
                    detail: String::new(),
                }
            } else {
                let body = resp.text().await.unwrap_or_default();
                TestResult {
                    ok: false,
                    message: format!("API 错误: {}", truncate(&body, 100)),
                    elapsed_ms,
                    detail: String::new(),
                }
            }
        }
        Err(e) => TestResult {
            ok: false,
            message: format!("连接失败: {}", e),
            elapsed_ms,
            detail: String::new(),
        },
    }
}

fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len])
    }
}
