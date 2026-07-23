# SayDone v0.0.7 备份 — 2026-07-12 (VAD 漏字修复)

## 修复内容
修复 LocalProvider 在「停嘴后不松手等几秒」场景下的尾部漏字问题，以及移除编排器对极短输入的无条件硬丢弃。

## Bug 1：LocalProvider VAD 状态机语义错误（核心 bug）

**问题**：用户说话 → 1.2s 静音 flush 触发 → `voiceActive` 被重置为 false → 用户继续按着不发声 → pending 段持续累积静音 PCM → 用户松手 → `stop()` 检查 `voiceActive=false` → **整段尾部丢弃**。

**场景 B（更严重）**：用户在 flush 后再次开口 → 那段真实语音同样被吞，因为 pending 段从未触发 flush。

**修复**（`client/src/services/transcription/LocalProvider.ts`）：
把 VAD 状态字段从单一 `voiceActive` 拆为三状态：
- `pendingHasVoice`（pending 段级，flush 后清零）
- `sessionHadVoice`（session 级，单调，只升不降）
- `silentFramesInPending`（pending 段级静音帧数）

**新语义**：
- flush 只重置 pending 段（`pendingHasVoice=false`），不清 `sessionHadVoice`
- stop 判定改为 `pendingHasVoice || sessionHadVoice`，覆盖"停嘴后等几秒才松手"场景
- pendingHasVoice 在新语音到来时重新置 true，新段可正常 flush

## Bug 2：编排器对极短输入的无条件硬丢弃

**问题**：`RecorderOrchestrator.ts` 在 `audioDur < 0.5` 时直接 `resetToIdle()`，无论内容是否纯静音。导致说"在"、"嗯"、英文 "yes" 等极短输入被丢弃。

**修复**（`client/src/services/recorder/RecorderOrchestrator.ts` L1399）：
改用 `silenceRatio >= 0.98` 判定是否为纯静音。
- 录音 < 0.5s **且** 几乎全静音 → 丢弃（防误触）
- 录音 < 0.5s **但** 有真实语音 → 走完整 ASR 流程
- 录音 ≥ 0.5s → 走完整 ASR 流程

## 调试日志
新增 `local/stop 收尾` 事件，记录 `pendingDurSec` / `pendingHasVoice` / `sessionHadVoice` / `silentMsInPending` / `tailEnqueued` / `queueLen`，便于复现验证。

## 构建产物
- `SayDone_0.0.7_x64-setup.exe` (NSIS)
- `SayDone_0.0.7_x64_zh-CN.msi`
- `SayDone_0.0.7_x64_en-US.msi`
- `saydone.exe` (43M)

## 验证
- ✅ `npx tsc --noEmit` 通过
- ✅ `npx tauri build` 成功（2m 00s）

## 建议手动测试矩阵
| 场景 | 预期 |
|---|---|
| 说话 → 停嘴 3s → 松手 | 尾段完整识别 |
| 说话 → 停嘴 → 再说 → 松手 | 多段都识别 |
| 短促输入（"在"/"嗯"） | 不再硬丢弃 |
| 误触 PTT（0.3s 纯静音） | 仍然丢弃（防误触） |