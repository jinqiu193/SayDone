// Tavily 联网搜索 — 给 AI 对话补"实时上下文"。
// 仅在 Chat 模式（含选区即指令）启用，与 RAG 形成互补：RAG 是本地知识库，Tavily 是联网。
//
// 模块划分：
// - types：请求/响应/配置 struct
// - search：HTTP 调用 + 结果格式化
// - cmd：3 个 Tauri commands + 1 个供 ai_chat 内部调用的 augment helper

pub mod cmd;
pub mod search;
pub mod types;
