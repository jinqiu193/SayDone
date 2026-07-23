// 本地 ASR 推理 — 使用 sherpa-onnx 官方 Rust crate
// 模型加载后缓存，节省每次推理的初始化开销

use serde::Serialize;
use std::path::Path;
use std::sync::Mutex;
use std::time::Instant;

use sherpa_onnx::{
    OfflineFireRedAsrCtcModelConfig,
    OfflineFireRedAsrModelConfig,
    OfflineFunASRNanoModelConfig,
    OfflineRecognizer,
    OfflineRecognizerConfig,
    OfflineSenseVoiceModelConfig,
    OfflineWhisperModelConfig,
};

use super::downloader::model_dir;

#[derive(Debug, Clone, Serialize)]
pub struct LocalAsrResult {
    pub text: String,
    pub elapsed_ms: u64,
}

pub(crate) struct RecognizerCache {
    model_id: String,
    language: String,
    recognizer: OfflineRecognizer,
}

unsafe impl Send for RecognizerCache {}

static CACHE: Mutex<Option<RecognizerCache>> = Mutex::new(None);

const WARMUP_SAMPLE_MS: usize = 1000;

fn optimal_threads() -> i32 {
    std::thread::available_parallelism()
        .map(|n| n.get() as i32)
        .unwrap_or(4)
        .max(1)
        .min(16)
}

fn build_config(num_threads: i32) -> OfflineRecognizerConfig {
    let mut config = OfflineRecognizerConfig::default();
    config.model_config.num_threads = num_threads;
    config
}

fn create_sensevoice(
    dir: &Path,
    model_id: &str,
    language: &str,
    num_threads: i32,
) -> Result<OfflineRecognizer, String> {
    let model_path = dir.join("model.int8.onnx");
    let model_path = if model_path.exists() {
        model_path
    } else {
        let fp32 = dir.join("model.onnx");
        if fp32.exists() { fp32 } else { return Err("模型文件不存在".into()); }
    };
    let tokens_path = dir.join("tokens.txt");
    if !tokens_path.exists() {
        return Err("tokens.txt 不存在".into());
    }

    let use_itn = !model_id.contains("funasr-nano");
    let mut config = build_config(num_threads);
    config.model_config.sense_voice = OfflineSenseVoiceModelConfig {
        model: Some(model_path.to_string_lossy().to_string()),
        language: Some(language.to_string()),
        use_itn,
    };
    config.model_config.tokens = Some(tokens_path.to_string_lossy().to_string());

    OfflineRecognizer::create(&config)
        .ok_or_else(|| "SenseVoice 初始化失败".to_string())
}

fn create_whisper(
    dir: &Path,
    model_id: &str,
    language: &str,
    num_threads: i32,
) -> Result<OfflineRecognizer, String> {
    let size = model_id.split('-').last().unwrap_or("small");
    let encoder = dir.join(format!("{}-encoder.int8.onnx", size));
    let decoder = dir.join(format!("{}-decoder.int8.onnx", size));
    let tokens = dir.join(format!("{}-tokens.txt", size));

    if !encoder.exists() || !decoder.exists() {
        return Err(format!(
            "Whisper 模型文件不完整,需 {}-encoder/decoder.int8.onnx",
            size
        ));
    }

    let mut config = build_config(num_threads);
    config.model_config.whisper = OfflineWhisperModelConfig {
        encoder: Some(encoder.to_string_lossy().to_string()),
        decoder: Some(decoder.to_string_lossy().to_string()),
        language: Some(if language == "auto" { "".into() } else { language.to_string() }),
        ..Default::default()
    };
    config.model_config.tokens = Some(tokens.to_string_lossy().to_string());

    OfflineRecognizer::create(&config)
        .ok_or_else(|| "Whisper 初始化失败".to_string())
}

fn create_funasr_nano(
    dir: &Path,
    language: &str,
    num_threads: i32,
) -> Result<OfflineRecognizer, String> {
    let encoder_adaptor = dir.join("encoder_adaptor.int8.onnx");
    let llm = dir.join("llm.int8.onnx");
    let embedding = dir.join("embedding.int8.onnx");
    let tokenizer = dir.join("Qwen3-0.6B");

    if !encoder_adaptor.exists() || !llm.exists() || !embedding.exists() {
        return Err("FunASR Nano 模型文件不完整".into());
    }
    if !tokenizer.exists() {
        return Err("FunASR Nano tokenizer 目录不存在(Qwen3-0.6B/)".into());
    }

    let mut config = build_config(num_threads);
    config.model_config.funasr_nano = OfflineFunASRNanoModelConfig {
        encoder_adaptor: Some(encoder_adaptor.to_string_lossy().to_string()),
        llm: Some(llm.to_string_lossy().to_string()),
        embedding: Some(embedding.to_string_lossy().to_string()),
        tokenizer: Some(tokenizer.to_string_lossy().to_string()),
        language: Some(if language == "auto" { "".into() } else { language.to_string() }),
        max_new_tokens: 200,
        ..Default::default()
    };

    OfflineRecognizer::create(&config)
        .ok_or_else(|| "FunASR Nano 初始化失败".to_string())
}

fn create_fire_red_ctc(dir: &Path, num_threads: i32) -> Result<OfflineRecognizer, String> {
    let model = dir.join("model.int8.onnx");
    if !model.exists() {
        return Err("FireRedASR2-CTC 模型文件不存在(model.int8.onnx)".into());
    }
    let tokens = dir.join("tokens.txt");
    if !tokens.exists() {
        return Err("tokens.txt 不存在".into());
    }

    let mut config = build_config(num_threads);
    config.model_config.fire_red_asr_ctc = OfflineFireRedAsrCtcModelConfig {
        model: Some(model.to_string_lossy().to_string()),
    };
    config.model_config.tokens = Some(tokens.to_string_lossy().to_string());

    OfflineRecognizer::create(&config)
        .ok_or_else(|| "FireRedASR2-CTC 初始化失败".to_string())
}

fn create_fire_red_aed(dir: &Path, num_threads: i32) -> Result<OfflineRecognizer, String> {
    let encoder = dir.join("encoder.int8.onnx");
    let decoder = dir.join("decoder.int8.onnx");
    if !encoder.exists() || !decoder.exists() {
        return Err("FireRedASR2-AED 模型文件不完整(需 encoder.int8.onnx + decoder.int8.onnx)".into());
    }
    let tokens = dir.join("tokens.txt");
    if !tokens.exists() {
        return Err("tokens.txt 不存在".into());
    }

    let mut config = build_config(num_threads);
    config.model_config.fire_red_asr = OfflineFireRedAsrModelConfig {
        encoder: Some(encoder.to_string_lossy().to_string()),
        decoder: Some(decoder.to_string_lossy().to_string()),
    };
    config.model_config.tokens = Some(tokens.to_string_lossy().to_string());

    OfflineRecognizer::create(&config)
        .ok_or_else(|| "FireRedASR2-AED 初始化失败".to_string())
}

fn warmup_recognizer(recognizer: &OfflineRecognizer) {
    let num_samples = (16000usize) * WARMUP_SAMPLE_MS / 1000;
    let dummy: Vec<f32> = vec![0.0f32; num_samples];
    let stream = recognizer.create_stream();
    stream.accept_waveform(16000, &dummy);
    recognizer.decode(&stream);
}

pub fn ensure_loaded_pub(model_id: &str, language: &str) -> Result<(), String> {
    ensure_loaded_internal(model_id, language, true)
}

pub fn preload_in_parallel(model_ids: &[&str], language: &str) {
    let lang = language.to_string();
    let ids: Vec<String> = model_ids.iter().map(|s| (*s).to_string()).collect();
    std::thread::spawn(move || {
        let num_threads = optimal_threads();
        for model_id in ids {
            let dir = model_dir(&model_id);
            if !dir.exists() {
                continue;
            }
            log::info!("并行预加载模型: {}", model_id);
            let m = model_id.to_string();
            let l = lang.clone();
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                match create_recognizer_internal(&dir, &m, &l, num_threads) {
                    Ok(rec) => {
                        warmup_recognizer(&rec);
                        let mut cache = CACHE.lock().map_err(|e| e.to_string())?;
                        if cache.is_none() {
                            *cache = Some(RecognizerCache {
                                model_id: m,
                                language: l,
                                recognizer: rec,
                            });
                        }
                        Ok(())
                    }
                    Err(e) => Err(e),
                }
            }));
            if let Err(e) = result {
                let msg = if let Some(s) = e.downcast_ref::<String>() { s.clone() } else { "panic".into() };
                log::warn!("并行预加载 {} 失败: {}", model_id, msg);
            }
        }
    });
}

fn create_recognizer_internal(
    dir: &Path,
    model_id: &str,
    language: &str,
    num_threads: i32,
) -> Result<OfflineRecognizer, String> {
    if model_id.starts_with("whisper-") {
        create_whisper(dir, model_id, language, num_threads)
    } else if model_id.starts_with("funasr-nano") {
        create_funasr_nano(dir, language, num_threads)
    } else if model_id.starts_with("fire-red-asr2-ctc") {
        create_fire_red_ctc(dir, num_threads)
    } else if model_id.starts_with("fire-red-asr2-aed") {
        create_fire_red_aed(dir, num_threads)
    } else {
        create_sensevoice(dir, model_id, language, num_threads)
    }
}

fn ensure_loaded_internal(model_id: &str, language: &str, warmup: bool) -> Result<(), String> {
    let num_threads = optimal_threads();
    let mut cache = CACHE.lock().map_err(|e| format!("Mutex 获取失败: {}", e))?;

    if let Some(ref c) = *cache {
        if c.model_id == model_id && c.language == language {
            return Ok(());
        }
    }

    let dir = model_dir(model_id);
    if !dir.exists() {
        return Err(format!("模型 \"{}\" 尚未下载", model_id));
    }

    log::info!("Loading ASR model: {}", model_id);
    let start = Instant::now();

    let recognizer = create_recognizer_internal(&dir, model_id, language, num_threads)?;

    log::info!(
        "ASR model loaded in {}ms: {} (lang={})",
        start.elapsed().as_millis(),
        model_id,
        language
    );

    if warmup {
        drop(cache);
        warmup_recognizer(&recognizer);
        log::info!("模型预热完成: {}", model_id);
        cache = CACHE.lock().map_err(|e| format!("Mutex 获取失败: {}", e))?;
    }

    *cache = Some(RecognizerCache {
        model_id: model_id.to_string(),
        language: language.to_string(),
        recognizer,
    });
    Ok(())
}

fn transcribe_with_cache(samples: &[f32]) -> Result<String, String> {
    let cache = CACHE.lock().map_err(|e| format!("Mutex 获取失败: {}", e))?;
    let entry = cache.as_ref().ok_or("模型未加载")?;

    let stream = entry.recognizer.create_stream();
    stream.accept_waveform(16000, samples);
    entry.recognizer.decode(&stream);
    let result = stream
        .get_result()
        .ok_or_else(|| "获取识别结果失败".to_string())?;

    Ok(result.text.trim().to_string())
}

#[tauri::command]
pub async fn preload_local_model(model_id: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let start = Instant::now();
        ensure_loaded_internal(&model_id, "auto", true)?;
        Ok(format!("模型已加载({}ms)", start.elapsed().as_millis()))
    })
    .await
    .map_err(|e| format!("预加载异常: {}", e))?
}

#[tauri::command]
pub async fn local_transcribe(
    audio_b64: String,
    model_id: String,
    language: Option<String>,
) -> Result<LocalAsrResult, String> {
    let pcm_bytes = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        &audio_b64,
    )
    .map_err(|e| format!("base64 解码失败: {}", e))?;

    if pcm_bytes.len() < 2 {
        return Ok(LocalAsrResult { text: String::new(), elapsed_ms: 0 });
    }

    let samples: Vec<f32> = pcm_bytes
        .chunks_exact(2)
        .map(|c| i16::from_le_bytes([c[0], c[1]]) as f32 / 32768.0)
        .collect();

    tokio::task::spawn_blocking(move || {
        let lang = language.as_deref().unwrap_or("auto");
        ensure_loaded_internal(&model_id, lang, true)?;

        let start = Instant::now();
        let text = transcribe_with_cache(&samples)?;

        Ok(LocalAsrResult {
            text,
            elapsed_ms: start.elapsed().as_millis() as u64,
        })
    })
    .await
    .map_err(|e| format!("推理异常: {}", e))?
}

pub fn get_cache_lock() -> Result<std::sync::MutexGuard<'static, Option<RecognizerCache>>, String> {
    CACHE.lock().map_err(|e| format!("Mutex 获取失败: {}", e))
}

impl RecognizerCache {
    pub fn transcribe(&self, _sample_rate: u32, samples: &[f32]) -> String {
        let stream = self.recognizer.create_stream();
        stream.accept_waveform(16000, samples);
        self.recognizer.decode(&stream);
        stream
            .get_result()
            .map(|r| r.text.trim().to_string())
            .unwrap_or_default()
    }
}
