# Phase 1 Refactor — RecorderOrchestrator 拆分

**日期**：2026-07-14
**目标**：把 2124 行的"上帝类"拆成 5 个职责独立的子模块 + 顶层 facade

## 改动结果

| 指标 | 改前 | 改后 |
|---|---|---|
| `RecorderOrchestrator.ts` | 2124 行 | **965 行**（-55%） |
| 子模块数 | 0 | 5 |
| 公共 API 变动 | — | **0**（完全向后兼容） |
| TypeScript 错误 | — | **0** |
| 单元测试 | 25 (helpers) | **39** (+14 state machine) |

## 新增文件

| 文件 | 行数 | 职责 |
|---|---|---|
| `recorder/SettingsCache.ts` | 209 | 16 个 `cachedXxx` 字段 + 刷新/重连/鼠标 PTT IPC |
| `recorder/AudioPipeline.ts` | 283 | PCM 采集回调 + 波形 + 静音 + 增量写盘 + finalize |
| `recorder/PreviewEngine.ts` | 197 | 流式 ASR 预览（切段 + partial 推 overlay） |
| `recorder/TextInserter.ts` | 182 | probe 校验 + paste + 兜底卡片 |
| `recorder/ResultDispatcher.ts` | 411 | ASR / AI 结果分发 + 历史 + 个性化 |
| `recorder/__tests__/recorderStateMachine.test.ts` | +14 测试 | 状态机合法/非法转移全覆盖 |

## 关键设计

1. **RecorderContext 对象**：跨子模块共享的运行时上下文（lifecycle / per-run / shared），子模块构造时拿到引用，通过 `ctx.xxx` 读写，**不持有副本**避免不一致。
2. **依赖注入 `Deps` 接口**：子模块通过 `Deps` 注入 Orchestrator 的 callback（`resetToIdleFn` / `waitForModifierPTTReleaseIfNeeded` 等），**避免循环引用**。
3. **顶层 facade 保留**：状态机 / Tauri 事件订阅 / PTT 处理 / 录音 lifecycle / 子模块编排全在 RecorderOrchestrator；子模块纯粹做"我负责的事"。

## 工具链改进

- 修复 vitest 启动错误（vitest 4.x 需 Node ≥22.3，当前 Node 20.11.1），降级到 vitest 2.1.9
- helpers.ts 抽出 `isValidTransition` / `VALID_TRANSITIONS`（纯函数 → 可单测）
- types.ts 集中 14 个 timing 常量（`PREVIEW_*` / `SILENCE_*` / `LATE_FINAL_GRACE_MS` 等）

## 后续 (Phase 2 — 未做)

- `providers/traits.rs`：抽 `AiProvider` / `AsrProvider` Trait
- `registry.rs` 删 8 处 `match provider_name`
- 首次为 Rust 写单元测试

## Smoke 验证

- ✅ `npx tsc --noEmit`：0 错误
- ✅ `npx vitest run`：39/39 通过
- ✅ `npm run build`：成功
