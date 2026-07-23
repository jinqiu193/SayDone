# SayDone v0.0.7 备份 — 2026-07-12

## 变更说明
本次备份对应一次**回滚**操作：移除之前实验性加入的「智能回复」功能（基于窗口截图 + 多模态 LLM 生成回复草稿）。

用户反馈该功能在实际使用中不够稳定（截屏识别、触发词匹配、模型选择等环节都不够理想），决定彻底移除，恢复到引入该功能之前的 AI 对话行为。

## 删除的代码
- `client/src-tauri/src/commands/screenshot.rs`（Win32 GDI 截屏命令）
- `client/src/features/settings/SmartReplySection.tsx`（设置 UI）
- `client/src/services/recorder/RecorderOrchestrator.ts`：智能回复方法块（DEFAULT_SMART_REPLY_TRIGGERS / loadSmartReplyTriggers / detectSmartReplyTrigger / maybeRunSmartReply）
- `client/src/services/recorder/OverlayService.ts`：showAIThinkingMessage
- `client/src/services/bridge.ts`：screenshotWindow / aiSmartReply
- `client/src-tauri/src/providers/ai_openai_compat.rs`：smart_reply 多模态调用
- `client/src-tauri/src/providers/registry.rs`：ai_smart_reply Tauri command

## 移除的依赖
- `client/src-tauri/Cargo.toml`：`image = "0.25"`（仅 PNG encoding）

## 构建产物
- `SayDone_0.0.7_x64-setup.exe`：NSIS 安装包（推荐）
- `SayDone_0.0.7_x64_zh-CN.msi`：中文 MSI 安装包
- `SayDone_0.0.7_x64_en-US.msi`：英文 MSI 安装包
- `saydone.exe`：独立可执行文件（43M，含完整资源）

## 验证
- ✅ `npx tsc --noEmit` 通过
- ✅ `cargo check` 通过（35 个 pre-existing warning，与本次回滚无关）
- ✅ `npx tauri build` 成功

## 保留的功能
- 普通 AI 校对 / AI 对话
- UIA 选区捕获（`capture_selection`）+ 选区操作（Ctrl+语音指令）
- 本地 ASR（SenseVoice）
- 应用感知润色
- 历史记录 + RAG
