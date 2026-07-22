// ASR / AI 供应商的公共类型和 trait 定义

use serde::{Deserialize, Serialize};

/// ASR 识别结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AsrResult {
    pub text: String,
    /// 识别耗时（毫秒）
    pub elapsed_ms: u64,
}

/// AI 校对结果
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AiResult {
    pub text: String,
    /// 校对耗时（毫秒）
    pub elapsed_ms: u64,
    /// Tavily 联网搜索执行状态（前端据此决定是否打 addRuntimeEvent warn）
    /// 字段为 None 时前端应忽略。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tavily_status: Option<String>,
}

/// 连接测试结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestResult {
    pub ok: bool,
    pub message: String,
    pub elapsed_ms: u64,
    /// 测试详情（模型名、发送的 prompt、回复内容等）
    #[serde(default)]
    pub detail: String,
}

/// ASR 供应商配置（前端传入）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AsrProviderConfig {
    pub provider: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub app_id: String,
    /// 供应商特定的额外配置
    #[serde(default)]
    pub extra: serde_json::Value,
}

/// AI 供应商配置（前端传入）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiProviderConfig {
    pub provider: String,
    #[serde(default)]
    pub api_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub model: String,
    /// 供应商特定的额外配置
    #[serde(default)]
    pub extra: serde_json::Value,
}

/// 云端转写请求（前端传入）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudTranscribeRequest {
    /// base64 编码的 PCM Int16 音频
    pub audio_b64: String,
    pub sample_rate: u32,
    pub asr_config: AsrProviderConfig,
    /// 热词列表（豆包等供应商通过 request.context 直传）
    #[serde(default)]
    pub hotwords: Vec<String>,
}

/// 云端 AI 校对请求（前端传入）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudPolishRequest {
    pub text: String,
    pub ai_config: AiProviderConfig,
    #[serde(default)]
    pub system_prompt: Option<String>,
    /// 目标应用上下文（可选，用于应用感知润色）
    #[serde(default)]
    pub target_app: Option<TargetAppContext>,
}

/// 会议纪要总结请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingSummarizeRequest {
    pub text: String,
    pub ai_config: AiProviderConfig,
}

/// 目标应用上下文 — 用于应用感知润色
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TargetAppContext {
    /// 进程名（如 WeChat.exe、chrome.exe）
    pub process_name: String,
    /// 窗口标题
    pub window_title: String,
    /// 目标润色风格
    #[serde(default)]
    pub polish_style: PolishStyle,
}

/// 润色风格
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PolishStyle {
    /// 自动检测（根据目标应用决定）
    #[default]
    Auto,
    /// 随意模式：最小断句，保持口语化
    Casual,
    /// 标准模式：适度润色，添加标点
    Standard,
    /// 正式模式：书面语，优化结构
    Formal,
}

impl PolishStyle {
    pub fn as_str(&self) -> &'static str {
        match self {
            PolishStyle::Auto => "auto",
            PolishStyle::Casual => "casual",
            PolishStyle::Standard => "standard",
            PolishStyle::Formal => "formal",
        }
    }
}

// ─── AI 生成热词 ─────────────────────────────────────────────────────────────

/// AI 热词生成请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiHotwordsRequest {
    /// 用户角色 id 列表，例如 ["developer", "product"]
    pub roles: Vec<String>,
    /// 使用场景 id 列表，例如 ["code", "meeting"]
    pub scenarios: Vec<String>,
    /// 可选补充上下文（用户当前行业、项目代号等）
    #[serde(default)]
    pub extra_context: Option<String>,
    /// 用户配置的 AI provider
    pub ai_config: AiProviderConfig,
}

/// AI 热词生成结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiHotwordsResult {
    /// 解析后的热词数组
    pub words: Vec<String>,
    /// LLM 原始输出（解析失败时给前端调试用）
    #[serde(default)]
    pub raw_text: String,
    /// LLM 耗时（毫秒）；fallback 时为 0
    #[serde(default)]
    pub elapsed_ms: u64,
    /// "llm" = 来自 LLM 实时生成；"fallback" = 来自本地预置词集
    pub source: String,
}

