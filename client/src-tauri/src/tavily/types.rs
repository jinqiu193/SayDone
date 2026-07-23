// Tavily types — frontend ↔ backend exchange shapes.

use serde::{Deserialize, Serialize};

/// 前端持久化的用户配置（存 app_settings 里，分散在 tavily.* 键下）
///
/// Tauri 2 IPC 只对最外层 command 参数名做 camelCase ↔ snake_case 自动转换，
/// **不会**递归到内嵌 struct 字段。所以这里必须显式 `rename_all = "camelCase"`,
/// 否则前端发 `{apiKey, maxResults, topic}` 时 Rust 端 `api_key / max_results` 收不到,
/// 全部被 serde 默认值填充,实际表现为"填了 key 但永远读不到"。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TavilyConfig {
    pub enabled: bool,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_max_results")]
    pub max_results: u32,
    #[serde(default = "default_topic")]
    pub topic: String, // "general" | "news"
}

fn default_max_results() -> u32 {
    5
}
fn default_topic() -> String {
    "general".to_string()
}

impl Default for TavilyConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            api_key: String::new(),
            max_results: default_max_results(),
            topic: default_topic(),
        }
    }
}

/// 测试搜索时的入参（前端 TavilySearchToggle 点击"测试"按钮用）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery {
    pub query: String,
    #[serde(default)]
    pub max_results: Option<u32>,
    #[serde(default)]
    pub topic: Option<String>,
}

/// 单条搜索结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResultItem {
    pub title: String,
    pub url: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub score: f32,
}

/// 搜索返回（含耗时，便于前端观测）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResults {
    pub query: String,
    pub results: Vec<SearchResultItem>,
    pub elapsed_ms: u64,
}

/// 标识 Tavily augment 在 ai_chat 流程中的执行状态，
/// 前端 RecorderOrchestrator 据此决定是否打 addRuntimeEvent warning。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TavilyStatus {
    /// ai_chat 的 mode 不是 Chat，本轮不调用 Tavily
    Disabled,
    /// 用户没启用 Tavily 配置
    NotEnabled,
    /// 用户启用但没填 API key
    MissingApiKey,
    /// Tavily HTTP 调用成功
    Ok,
    /// 调用失败（网络/401/超时）—— prompt 已回退到无搜索版
    Failed,
}

impl Default for TavilyStatus {
    fn default() -> Self {
        TavilyStatus::Disabled
    }
}
