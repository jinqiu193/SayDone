# Phase 2 Task 1 — AudioPipeline + PreviewEngine 单测

**日期**：2026-07-14
**目标**：为核心行为复杂的子模块（AudioPipeline 283 行 / PreviewEngine 197 行）补单元测试

## 改动结果

| 指标 | 改前 | 改后 |
|---|---|---|
| `AudioPipeline.test.ts` | 0 测试 | **31 用例** |
| `PreviewEngine.test.ts` | 0 测试 | **19 用例** |
| 总 recorder 子模块测试 | 39 | **89**（+50） |
| 总测试 | 88 → 145 | 通过率 100% in recorder 目录 |
| TypeScript 错误 | — | **0** |

## 新增文件

- `client/src/services/recorder/__tests__/AudioPipeline.test.ts`（31 用例 / ~280 行）
- `client/src/services/recorder/__tests__/PreviewEngine.test.ts`（19 用例 / ~250 行）

## Mock 策略

- `vi.mock('../../bridge', ...)` — 覆盖 `appendPcmToWav` / `finalizeWavFile` / `cleanupIncompleteWav`
- `vi.mock('@tauri-apps/api/core', ...)` — 覆盖 `invoke` (PreviewEngine 用)
- `vi.mock('../../debugLog', ...)` — `addRuntimeEvent`
- `vi.mock('../../debugConsole', ...)` — `devLog`（避免 dynamic import 副作用）
- 手写 OverlayService stub：仅暴露 `getBarCount` / `pushListeningBars` / `showLowVolumeWarning` / `clearWarning` / `pushListeningPreview` / `clearListeningPreview`

## 测试数据构造

```ts
silencePcm(n, amp=0)        // 静音
loudPcm(n, amp=30000)       // 满幅，RMS≈0.92
nearSilenceRmsPcm(n, amp=60) // 0.0018（计入静默但不触发低音量告警）
trulyQuietPcm(n, amp=5)     // 0.00015（触发低音量告警）
```

## 覆盖分支

### AudioPipeline
- `startSession` / `reset` — incrementalRecordId 生命周期
- `onAudioBuffer` — buffer copy 语义
- `onPcmFrame` — 6 个分支（RMS 累积 / 波形 / 静音比 / peak amplitude / 低音量首次警告 / 5s 重警告 / 恢复清警告）
- `snapshotStats` — undefined / 4 位小数
- `flushRecordedChunksToDisk` — 空 / 0 字节 / 首块 / 失败回滚 / isFirst 切换
- `finalize` — 无数据 / 成功 / IPC 失败
- `cleanupIncomplete` — 跳过 / 调 IPC / 吞错

### PreviewEngine
- `startSession` / `reset` — sessionId 生命周期
- `onProviderPartial` — 4 个分支（state / preview 关 / 空 / 重复 / 递增 key）
- `onPcmFrame` — 5 个分支（preview 关 / in-flight 锁 / RMS 阈值 / 切段 / 总样本阈值）
- `transcribeSegmentPreview` — 6 个分支（server 跳过 / local / cloud / race stop / 空文本 / 重复 / catch 吞错 / finally 释放）

## 验收

- ✅ `npx tsc --noEmit` — 0 错误
- ✅ `npx vitest run src/services/recorder/__tests__/` — **50/50 通过**
- ✅ 既有 39 测试无回归
- ✅ 行为分支覆盖 ~100%（除 `chunksFromMerged` 私有工具函数，间接通过失败回滚用例覆盖）

## 后续

- Task 2: RecorderEventBridge 拆分（`RecorderOrchestrator.init()` 139 行 → 6 行）
