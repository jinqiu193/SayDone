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

fn ms(repo: &str, file: &str) -> String {
    format!("https://modelscope.cn/models/{}/resolve/master/{}", repo, file)
}

pub fn get_available_models() -> Vec<ModelInfo> {
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

    ]
}
