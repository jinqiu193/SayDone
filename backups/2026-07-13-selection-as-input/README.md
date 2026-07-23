# SayDone v0.0.7 备份 — 2026-07-13 (选区即指令)

## 变更说明
AI 模式下，选中文字后未说话就直接松手时，把选中的文字**直接当作 AI 输入**，让 AI 重新回复，结果**替换原选区**。

## 改动详情（仅前端 `client/src/services/recorder/RecorderOrchestrator.ts`）

### 1. 移除"短按纯静音"误触短路对选区的覆盖
`stopRecording` 中的 0.5s + 98% 静音短路原本会把所有"短按不说话"的输入当作误触 resetToIdle。现在加上 `&& !hasSelection` 守卫：AI 模式下用户有选区时优先放行，让流程继续走选区内容处理路径。

### 2. 打通"无 ASR 文本 + 有选区"路径
`processAIChatResult` 引入 `effectiveText = rawAsrText || selectedText`，即：
- 用户说话 + 选区 → effectiveText = 语音文本（双信封仍走原有逻辑）
- 用户不说话 + 选区 → effectiveText = 选区文本（走普通 AI 对话）
- ASR 空 + 无选区 → 弹浮窗"没有识别到语音内容，也没有选区文字"

### 3. `bridge.aiChat` 调用调整
selectedText 参数仅在「用户既说话又有选区」时传入（双信封路径）；「无语音 + 有选区」场景不传，让 Rust 走普通 AI 对话流程而非双信封。

### 4. 历史记录
`addHistory` 的 `asrText` 字段也使用 `effectiveText`，方便日后回放看到"该 AI 输出是基于哪段内容生成的"。

### 5. pasteText 路径无改动
`handleTextInsertion`（L917-919）原本就用 `selectionHwnd + selectionLength` 替换原选区，新场景下 `this.capturedSelection` 未被 resetToIdle 清空，AI 输出的 paste 仍会精准替换。

## Rust 端无改动

`ai_chat` 收到的 `text` 在新场景下是非空选区文本，根本不触发 Rust 端的空短路（L358）。所有现有逻辑（WrapMode::Proofread / Chat / RAG hook / polish_with_mode 等）正常生效。

## 构建产物
- `SayDone_0.0.7_x64-setup.exe` (NSIS, 11M)
- `SayDone_0.0.7_x64_zh-CN.msi` (16M)
- `SayDone_0.0.7_x64_en-US.msi` (16M)
- `saydone.exe` (43M)

## 验证
- ✅ `npx tsc --noEmit` 通过
- ✅ `npx tauri build` 成功

## 手动测试建议
| 场景 | 预期 |
|---|---|
| AI 模式 + 记事本选中 100 字 + 不说话 + 松手 | 选区 → AI → 替换选区 |
| AI 模式 + 说话"帮我润色" + 选区 | 走双信封，选区被润色（原有行为） |
| AI 模式 + 不说话 + 无选区 | 误触 resetToIdle（原有行为） |
| 听写模式 + 说话（无论有无选区） | 不进 AI 模式（原有行为） |