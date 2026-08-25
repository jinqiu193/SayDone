// Model catalog

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadSource {
    pub source: String,
    pub files: Vec<ModelFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelFile {
    pub name: String,
    pub url: String,
    pub size_bytes: u64,
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub model_type: String,
    pub total_size_bytes: u64,
    pub languages: Vec<String>,
    pub sources: Vec<DownloadSource>,
    #[serde(default)]
    pub archive_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalModelInfo {
    pub id: String,
    pub name: String,
    pub model_type: String,
    pub total_size_bytes: u64,
    pub path: String,
    pub complete: bool,
}

fn hf(repo: &str, file: &str) -> String {
    format!("https://huggingface.co/{}/resolve/main/{}", repo, file)
}

fn hf_mirror(repo: &str, file: &str) -> String {
    format!("https://hf-mirror.com/{}/resolve/main/{}", repo, file)
}

fn ms(repo: &str, file: &str) -> String {
    format!("https://modelscope.cn/models/{}/resolve/master/{}", repo, file)
}

pub fn get_available_models() -> Vec<ModelInfo> {
    let hf_repo = "csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17";
    let ms_repo = "xiaowangge/sherpa-onnx-sense-voice-small";
    let ms_gguf_repo = "FunAudioLLM/SenseVoiceSmall-GGUF";
    let ms_vad_gguf_repo = "FunAudioLLM/fsmn-vad-GGUF";
    let langs = vec!["zh".into(), "en".into(), "ja".into(), "ko".into(), "yue".into()];

    vec![
        // ===== GGUF 版本（新）=====
        ModelInfo {
            id: "sensevoice-small-gguf-q8".into(),
            name: "SenseVoice Small GGUF (Q8)".into(),
            description: "254MB · llama.cpp 运行时 · 中文更准 · 内置 VAD · 推荐".into(),
            model_type: "sensevoice-gguf".into(),
            total_size_bytes: 254 * 1024 * 1024 + 12 * 1024 * 1024, // + VAD 约12MB
            languages: langs.clone(),
            sources: vec![
                DownloadSource {
                    source: "ModelScope".into(),
                    files: vec![
                        ModelFile { name: "sensevoice-small-q8.gguf".into(), url: ms(ms_gguf_repo, "sensevoice-small-q8.gguf"), size_bytes: 254_194_124, sha256: None },
                        ModelFile { name: "fsmn-vad.gguf".into(), url: ms(ms_vad_gguf_repo, "fsmn-vad.gguf"), size_bytes: 1_720_064, sha256: None },
                    ],
                },
            ],
            archive_url: None,
        },
        ModelInfo {
            id: "sensevoice-small-gguf-f16".into(),
            name: "SenseVoice Small GGUF (F16)".into(),
            description: "470MB · 精度更高 · llama.cpp 运行时 · 内置 VAD".into(),
            model_type: "sensevoice-gguf".into(),
            total_size_bytes: 470 * 1024 * 1024 + 2 * 1024 * 1024,
            languages: langs.clone(),
            sources: vec![
                DownloadSource {
                    source: "ModelScope".into(),
                    files: vec![
                        ModelFile { name: "sensevoice-small-f16.gguf".into(), url: ms(ms_gguf_repo, "sensevoice-small-f16.gguf"), size_bytes: 493_000_000, sha256: None },
                        ModelFile { name: "fsmn-vad.gguf".into(), url: ms(ms_vad_gguf_repo, "fsmn-vad.gguf"), size_bytes: 1_720_064, sha256: None },
                    ],
                },
            ],
            archive_url: None,
        },

        // ===== ONNX 版本（保留）=====
        ModelInfo {
            id: "sensevoice-small".into(),
            name: "SenseVoice Small ONNX (INT8)".into(),
            description: "228MB · sherpa-onnx · 速度快 · 中/英/日/韩/粤".into(),
            model_type: "sensevoice".into(),
            total_size_bytes: 228 * 1024 * 1024,
            languages: langs.clone(),
            sources: vec![
                DownloadSource {
                    source: "ModelScope".into(),
                    files: vec![
                        ModelFile { name: "model.int8.onnx".into(), url: ms(ms_repo, "model_q8.onnx"), size_bytes: 0, sha256: None },
                        ModelFile { name: "tokens.txt".into(), url: ms(ms_repo, "tokens.txt"), size_bytes: 0, sha256: None },
                    ],
                },
                DownloadSource {
                    source: "HuggingFace".into(),
                    files: vec![
                        ModelFile { name: "model.int8.onnx".into(), url: hf(hf_repo, "model.int8.onnx"), size_bytes: 0, sha256: None },
                        ModelFile { name: "tokens.txt".into(), url: hf(hf_repo, "tokens.txt"), size_bytes: 0, sha256: None },
                    ],
                },
                DownloadSource {
                    source: "HuggingFace Mirror".into(),
                    files: vec![
                        ModelFile { name: "model.int8.onnx".into(), url: hf_mirror(hf_repo, "model.int8.onnx"), size_bytes: 0, sha256: None },
                        ModelFile { name: "tokens.txt".into(), url: hf_mirror(hf_repo, "tokens.txt"), size_bytes: 0, sha256: None },
                    ],
                },
            ],
            archive_url: None,
        },
        ModelInfo {
            id: "sensevoice-small-fp32".into(),
            name: "SenseVoice Small ONNX (FP32)".into(),
            description: "937MB · 精度更高 · sherpa-onnx · 中/英/日/韩/粤".into(),
            model_type: "sensevoice".into(),
            total_size_bytes: 937 * 1024 * 1024,
            languages: langs,
            sources: vec![
                DownloadSource {
                    source: "ModelScope".into(),
                    files: vec![
                        ModelFile { name: "model.onnx".into(), url: ms(ms_repo, "model.onnx"), size_bytes: 0, sha256: None },
                        ModelFile { name: "tokens.txt".into(), url: ms(ms_repo, "tokens.txt"), size_bytes: 0, sha256: None },
                    ],
                },
                DownloadSource {
                    source: "HuggingFace".into(),
                    files: vec![
                        ModelFile { name: "model.onnx".into(), url: hf(hf_repo, "model.onnx"), size_bytes: 0, sha256: None },
                        ModelFile { name: "tokens.txt".into(), url: hf(hf_repo, "tokens.txt"), size_bytes: 0, sha256: None },
                    ],
                },
                DownloadSource {
                    source: "HuggingFace Mirror".into(),
                    files: vec![
                        ModelFile { name: "model.onnx".into(), url: hf_mirror(hf_repo, "model.onnx"), size_bytes: 0, sha256: None },
                        ModelFile { name: "tokens.txt".into(), url: hf_mirror(hf_repo, "tokens.txt"), size_bytes: 0, sha256: None },
                    ],
                },
            ],
            archive_url: None,
        },
    ]
}
