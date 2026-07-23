# SayDone v0.0.7 备份 — 2026-07-13 12:00 (选区即指令 · 重打包)

## 变更
本目录是 `2026-07-13-selection-as-input` 的**重打包产物**。

代码本身没有改动（仍是「AI 模式 + 选中文字 + 不说话 → 选区内容当作 AI 输入 + 替换原选区」），本次只是用户要求重新走一遍 `tauri build` 并备份。

## 构建产物
- `SayDone_0.0.7_x64-setup.exe` (NSIS, 11M)
- `SayDone_0.0.7_x64_zh-CN.msi` (16M)
- `SayDone_0.0.7_x64_en-US.msi` (16M)
- `saydone.exe` (43M)

## 包含的修复
详见 `2026-07-13-selection-as-input/README.md`：
1. `stopRecording` 误触短路对选区放行
2. `processAIChatResult` 引入 `effectiveText = rawAsrText || selected_text`
3. `bridge.aiChat` 调用条件性传 `selectedText`
4. 历史记录 asrText 用 effectiveText