# SayDone v0.0.7 备份 — 2026-07-12 19:53 (VAD 修复重打版)

## 变更
本目录是 `2026-07-12-vad-fix` 的**重打包产物**。

代码本身没有改动（仍是 VAD 状态机修复版本），本次只是用户要求重新走一遍 `tauri build` 并备份。

## 构建产物
- `SayDone_0.0.7_x64-setup.exe` (NSIS, 11M)
- `SayDone_0.0.7_x64_zh-CN.msi` (中文 MSI, 16M)
- `SayDone_0.0.7_x64_en-US.msi` (英文 MSI, 16M)
- `saydone.exe` (43M)

## 构建时间
- `npx tauri build`：1m 53s

## 包含的修复
详见 `2026-07-12-vad-fix/README.md`：
1. LocalProvider VAD 状态机重写（停嘴后不松手不再漏字）
2. 编排器极短输入判定改为基于 silenceRatio（不再无脑丢弃）