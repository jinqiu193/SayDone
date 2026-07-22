// 统一配置系统 — 在 Storage 之上提供类型安全的配置访问
// 支持内存缓存（减少 DB 查询）+ 热重载（配置变更时刷新）

use serde::{Deserialize, Serialize};
use std::sync::RwLock;

use crate::storage::Storage;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AsrConfig {
    pub engine: String,
    pub model_id: String,
    pub language: String,
    pub hotkey: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    pub provider: String,
    pub api_url: String,
    pub model: String,
    pub system_prompt: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppearanceConfig {
    pub theme: String,
    pub show_duration: bool,
    pub bar_count: i32,
    pub wave_theme: String,
    pub font_size: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub asr: AsrConfig,
    pub ai: AiConfig,
    pub appearance: AppearanceConfig,
    pub auto_launch: bool,
    pub start_minimized: bool,
    pub hf_enabled: bool,
    pub hf_hotkey: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            asr: AsrConfig {
                engine: "doubao".into(),
                model_id: "SenseVoice".into(),
                language: "auto".into(),
                hotkey: "AltRight".into(),
            },
            ai: AiConfig {
                provider: "openai_compat".into(),
                api_url: "https://api.deepseek.com".into(),
                model: "deepseek-chat".into(),
                system_prompt: None,
                enabled: true,
            },
            appearance: AppearanceConfig {
                theme: "black-blue".into(),
                show_duration: true,
                bar_count: 24,
                wave_theme: "black-blue".into(),
                font_size: "14".into(),
            },
            auto_launch: false,
            start_minimized: false,
            hf_enabled: false,
            hf_hotkey: "ControlRight".into(),
        }
    }
}

static CONFIG_CACHE: RwLock<Option<AppConfig>> = RwLock::new(None);

pub fn get_config(storage: &Storage) -> AppConfig {
    if let Ok(Some(cached)) = CONFIG_CACHE.read().map(|g| g.clone()) {
        return cached;
    }

    let get_str = |key: &str, default: &str| -> String {
        let val = storage.get(key, None);
        val.as_str().map(String::from).unwrap_or_else(|| default.into())
    };
    let get_bool = |key: &str, default: bool| -> bool {
        let val = storage.get(key, None);
        val.as_bool().unwrap_or(default)
    };
    let get_i64 = |key: &str, default: i64| -> i64 {
        let val = storage.get(key, None);
        val.as_i64().unwrap_or(default)
    };

    let cfg = AppConfig {
        asr: AsrConfig {
            engine: get_str("asr.engine", "doubao"),
            model_id: get_str("asr.model_id", "SenseVoice"),
            language: get_str("asr.language", "auto"),
            hotkey: get_str("asr.hotkey", "AltRight"),
        },
        ai: AiConfig {
            provider: get_str("ai.provider", "openai_compat"),
            api_url: get_str("ai.api_url", "https://api.deepseek.com"),
            model: get_str("ai.model", "deepseek-chat"),
            system_prompt: {
                let val = storage.get("ai.system_prompt", None);
                val.as_str().map(String::from)
            },
            enabled: get_bool("ai.enabled", true),
        },
        appearance: AppearanceConfig {
            theme: get_str("appearance.theme", "black-blue"),
            show_duration: get_bool("appearance.show_duration", true),
            bar_count: get_i64("appearance.bar_count", 24) as i32,
            wave_theme: get_str("appearance.wave_theme", "black-blue"),
            font_size: get_str("appearance.font_size", "14"),
        },
        auto_launch: get_bool("app.auto_launch", false),
        start_minimized: get_bool("app.start_minimized", false),
        hf_enabled: get_bool("app.hf_enabled", false),
        hf_hotkey: get_str("app.hf_hotkey", "ControlRight"),
    };

    if let Ok(mut cache) = CONFIG_CACHE.write() {
        *cache = Some(cfg.clone());
    }
    cfg
}

pub fn invalidate_cache() {
    if let Ok(mut cache) = CONFIG_CACHE.write() {
        *cache = None;
    }
}

pub fn get_asr_config(storage: &Storage) -> AsrConfig {
    get_config(storage).asr
}

pub fn get_ai_config(storage: &Storage) -> AiConfig {
    get_config(storage).ai
}

pub fn get_appearance_config(storage: &Storage) -> AppearanceConfig {
    get_config(storage).appearance
}
