# 2026-07-13 备份 — Tavily 联网搜索集成

## 本次变更

给 AI 对话加上 Tavily 联网搜索能力，在系统提示词里注入实时搜索结果，让模型回答更准确。

**只在 Chat 模式 + 选区即指令路径启用**，Proofread 模式不启用。

## 新增文件

- `client/src-tauri/src/tavily/mod.rs` — 模块声明
- `client/src-tauri/src/tavily/types.rs` — TavilyConfig / SearchQuery / SearchResults / TavilyStatus
- `client/src-tauri/src/tavily/search.rs` — reqwest 调用 + 结果格式化 + 截断
- `client/src-tauri/src/tavily/cmd.rs` — 3 个 Tauri commands + 1 个内部 augment helper
- `client/src/services/tavily/types.ts` — 前端类型镜像
- `client/src/services/tavily/bridge.ts` — IPC 封装
- `client/src/features/settings/TavilySearchToggle.tsx` — 设置 UI

## 修改文件

- `client/src-tauri/src/main.rs` — 注册 `mod tavily` + 3 个 invoke handler
- `client/src-tauri/src/providers/registry.rs` — Chat 路径在 RAG 之后再叠 Tavily augment；选区即指令路径也调用；AiResult 增加可选字段 `tavily_status`
- `client/src-tauri/src/providers/types.rs` — AiResult 加 `tavily_status: Option<String>`
- `client/src-tauri/src/providers/{ai_openai_compat,ai_ollama,meeting_summarize}.rs` — 全部 AiResult 构造加 `..Default::default()`
- `client/src/features/settings/AIInstructionsPage.tsx` — 在 KnowledgeBaseToggle 之后插入 TavilySearchToggle
- `client/src/services/recorder/RecorderOrchestrator.ts` — aiChat 返回后根据 `tavily_status` 派发 addRuntimeEvent

## API Key 安全策略（重要）

用户提供的 Tavily API key (`tvly-...`) **未写入任何源码、settings seed 或测试 fixture**。

- 设置面板提供「API Key」Password 输入框，用户自行填写后通过 IPC 存到本地 SQLite
- Key 仅在 Rust 端持有并使用（不暴露到前端 DevTools / WebView）
- 默认 `tavily.enabled = false`，key 留空

## 设置 UI 位置

设置 → AI 整理 → 「联网搜索 (Tavily)」卡片（在「知识库 (RAG)」下方）

可配置项：
- 启用开关
- API Key（密码框，带小眼睛切换）
- 主题（general / news）
- 结果数（3/5/8/10，默认 5）
- 「测试搜索」按钮：输入关键词，返回前 5 条结果的标题、链接、内容预览

## 行为约定

| 场景 | 行为 |
|---|---|
| `tavily.enabled = false` | 不调用 Tavily |
| `enabled = true` 但 key 为空 | 静默跳过（不发请求），`tavily_status = "missing_api_key"`，前端 warn |
| 401 / 网络错误 / 超时（15s） | 静默降级到无搜索版本 prompt，`tavily_status = "failed"`，前端 warn |
| 成功 | 把搜索结果拼到系统提示词末尾，`tavily_status = "ok"` |
| Proofread 模式 | 永远不调用 Tavily（`tavily_status = "disabled"`） |
| Query 长度 > 500 | 取头 400 + 尾 100 字符（避免超长 query） |
| 搜索结果总长度 > 12k | 按时间顺序丢弃最旧的（保留最近 12k） |

## 打包

构建命令：`cd client && npx tauri build`

构建耗时：2m 03s

产物（已备份到本目录）：
- `saydone.exe` — 裸 exe（43 MB）
- `SayDone_0.0.7_x64-setup.exe` — NSIS 安装包（11 MB）
- `SayDone_0.0.7_x64_zh-CN.msi` — 中文 MSI（16 MB）
- `SayDone_0.0.7_x64_en-US.msi` — 英文 MSI（16 MB）