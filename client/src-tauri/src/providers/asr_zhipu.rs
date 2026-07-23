// 智谱 GLM-ASR 供应商
// 接口：POST https://open.bigmodel.cn/api/paas/v4/audio/transcriptions
// multipart/form-data: model=glm-asr-2512, stream=false, file=@audio
// 模型名可在 AsrProviderConfig.extra.model 中覆盖，默认 glm-asr-2512

use super::types::{AsrProviderConfig, AsrResult, TestResult};
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
        .text("stream", "false")
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

    let elapsed_ms = start.elapsed().as_millis() as u64;
    eprintln!("[asr_zhipu] HTTP {} elapsed_ms={}", resp.status(), elapsed_ms);

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!(
            "智谱 ASR 请求失败 HTTP {}: {}",
            status,
            truncate(&body_text, 300)
        ));
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    let text = data
        .get("text")
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string();

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
