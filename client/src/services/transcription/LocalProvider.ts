// 本地模式 Provider
// 边录边按 VAD 静音切分增量调 Rust 侧本地 ASR，模拟 streaming partial 效果。
//
// 设计要点：
// - 录音期间: 静音 ≥ 1.2s 触发一次切分，把累积 PCM 送 local_transcribe → onPartial(text, isFinal=false)
// - 并行推理：多段同时发出 IPC（Rust 端 CACHE Mutex 自然串行执行推理），
//   避免串行 await 链让用户感觉到"卡"
// - stop 时: 把当前 pending 段尾部送 ASR（不再有长度门槛），剩余段继续走并行推理
// - onFinal 基于 seenPartialTexts 拼装（用户在录音中已看到的内容），不等 IPC
//   （等也只是为了拿同样的文字，没意义）
//
// 调参说明：
// - SILENCE_FLUSH_MS=1200 给停顿中继续说话留余地，避免一句话被切碎
// - MIN_SEGMENT_SEC=0.8 过滤噪声/气流
//
// VAD 状态机（修复 P1：停嘴后不松手导致尾段漏字）
// ───────────────────────────────────────────────────────────
// 三个相互独立的标志：
// - pendingHasVoice      : 当前 pending 段是否含语音（pending 段级，flush 后清零）
// - sessionHadVoice      : 整轮 session 是否曾有过语音（session 级，单调，只升不降）
// - silentFramesInPending: 当前 pending 段内连续静音样本数（pending 段级）
//
// 关键修复：旧版用单一 voiceActive，flush 后被重置为 false，
// 导致 stop() 时检测到 voiceActive=false 而把整段尾部丢弃。
// 此外若用户在 flush 后再次开口，新语音也无法触发 flush（同样吞字）。
//
// 新版语义：
// - flush 只重置 pending 段（pendingHasVoice=false, silentFramesInPending=0）
// - sessionHadVoice 整轮不降，保证 stop() 时只要本 session 说过话就送尾部
// - pendingHasVoice 在新语音到来时重新置 true，新段可正常 flush

import { invoke } from '@tauri-apps/api/core'
import { uint8ArrayToBase64 } from '@/lib/encoding'
import { getSetting } from '../store'
import { addRuntimeEvent } from '../debugLog'
import type { TranscriptionProvider, TranscriptionCallbacks, StartOptions, StopOptions, WorkMode } from './types'

const SAMPLE_RATE = 16000
const SILENCE_THRESHOLD = 0.02       // int16 RMS 归一化后的静音阈值
const SILENCE_FLUSH_MS = 1200         // 连续静音 ≥ 1.2s 触发切分
const MIN_SEGMENT_SEC = 0.8           // 太短的子段直接丢弃
const MAX_SEGMENT_SEC = 20            // 单段超过 20s 强制切
// 注意：stop 时的尾部不再有"长度门槛"。只要本 session 说过话（sessionHadVoice），
// 尾部 pending 全部送 ASR，模型识别为空就空，绝不丢音频。
// （极短的尾巴通常会被模型返回空字符串，结果就是没字，不会有副作用。）

interface QueuedSegment {
  audioB64: string
  durationSec: number
}

export class LocalProvider implements TranscriptionProvider {
  readonly mode: WorkMode = 'local'

  private callbacks: TranscriptionCallbacks = {}
  private sessionActive = false
  private startOpts: StartOptions | undefined
  private ready = false
  private sessionStartMs = 0
  private settled = false
  /** run 代次：start()/abort() 时自增，旧 run 的段结果与 final 一律丢弃 */
  private runSeq = 0

  // VAD 状态（pending 段级 + session 级，详见顶部注释）
  private pendingChunks: ArrayBuffer[] = []
  private pendingByteLen = 0
  private silentFramesInPending = 0  // 当前 pending 段内连续静音样本数
  private pendingHasVoice = false    // 当前 pending 段是否含语音（flush 后清零）
  private sessionHadVoice = false    // 整轮 session 是否曾有过语音（单调，只升不降）

  // 并行 in-flight：多段同时发 IPC，由 Rust CACHE Mutex 自然串行推理
  private queue: QueuedSegment[] = []
  private inflightCount = 0
  private inflightWaiters: Array<() => void> = []

  // 已推送的 partial 文本（stop 时拼成 fullText）
  private seenPartialTexts: string[] = []

  // ── Provider lifecycle ──

  async connect(callbacks: TranscriptionCallbacks): Promise<void> {
    this.callbacks = callbacks
    this.ready = true
    callbacks.onStateChange?.('connected')

    // 预加载本地模型（不阻塞 UI）
    try {
      const modelId = await getSetting('localAsr.modelId', 'sensevoice-small') as string
      if (modelId) {
        await invoke<string>('preload_local_model', { modelId })
      }
      callbacks.onReady?.({ asr: true, llm: false })
    } catch {
      callbacks.onReady?.({ asr: true, llm: false })
    }
  }

  start(opts?: StartOptions): boolean {
    if (!this.ready) {
      addRuntimeEvent('error', this.mode, 'start 失败：Provider 未就绪')
      return false
    }
    this.startOpts = opts
    this.sessionActive = true
    this.runSeq += 1
    this.sessionStartMs = Date.now()
    this.pendingChunks = []
    this.pendingByteLen = 0
    this.silentFramesInPending = 0
    this.pendingHasVoice = false
    this.sessionHadVoice = false
    this.queue = []
    this.inflightCount = 0
    this.inflightWaiters = []
    this.seenPartialTexts = []
    this.settled = false
    return true
  }

  sendAudio(buffer: ArrayBuffer): void {
    if (!this.sessionActive) return
    const copy = buffer.slice(0)
    this.pendingChunks.push(copy)
    this.pendingByteLen += copy.byteLength

    // 算 RMS（int16 → 归一化）
    const samples = new Int16Array(copy)
    if (samples.length > 0) {
      let sumSq = 0
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i] / 32768
        sumSq += s * s
      }
      const rms = Math.sqrt(sumSq / samples.length)

      if (rms <= SILENCE_THRESHOLD) {
        this.silentFramesInPending += samples.length
      } else {
        // 出现语音：清零本段静音计数，标记本段+session 都有语音
        this.silentFramesInPending = 0
        if (!this.pendingHasVoice) {
          this.pendingHasVoice = true
          this.sessionHadVoice = true
        }
      }
    }

    this.maybeFlush()
  }

  stop(_opts?: StopOptions): boolean {
    if (!this.sessionActive) return false
    this.sessionActive = false

    // 把尾部残留 PCM 入队。
    // 关键修复：判定用 sessionHadVoice（session 级，单调），不再用 pendingHasVoice
    // —— 即使 pendingHasVoice 已被 flush 清零，只要本 session 曾说过话，
    // 就把残留 PCM 送 ASR。这覆盖了"停嘴后等几秒才松手"的漏字场景。
    const durSec = this.pendingByteLen / 2 / SAMPLE_RATE
    const tailEnqueued = durSec > 0 && (this.pendingHasVoice || this.sessionHadVoice)
    if (tailEnqueued) {
      const b64 = this.encodePending()
      this.queue.push({ audioB64: b64, durationSec: durSec })
    } else if (durSec > 0) {
      // 尾部有 PCM 但本 session 完全没说过话 → 用户误触 PTT
      addRuntimeEvent('info', 'local', 'stop 丢弃纯静音尾段（防误触）', { durSec: durSec.toFixed(2) })
    }
    this.clearPending()

    addRuntimeEvent('info', 'local', 'stop 收尾', {
      pendingDurSec: durSec.toFixed(2),
      pendingHasVoice: this.pendingHasVoice,
      sessionHadVoice: this.sessionHadVoice,
      silentMsInPending: (this.silentFramesInPending / SAMPLE_RATE * 1000).toFixed(0),
      tailEnqueued,
      queueLen: this.queue.length,
    })

    this.settled = true

    // 启动所有段并行推理；stop 不再等所有完成就能触发 onFinal（基于已推送 partial）
    this.launchAllSegments()

    // 等待 in-flight 完成（短超时），再补一次 onFinal（确保最后一段的 partial 已落库）
    void this.waitInflightThenFinalize()
    return true
  }

  /** 中止在途处理（"处理中重新开始录音"场景）：
   *  自增 run 代次后，旧 run 尚未完成的段结果与 onFinal 全部丢弃，
   *  避免上一次录音的文字混入新一轮。 */
  abort(): void {
    this.runSeq += 1
    this.sessionActive = false
    this.settled = false
    this.queue = []
    this.clearPending()
    this.seenPartialTexts = []
  }

  disconnect(): void {
    this.sessionActive = false
    this.runSeq += 1
    this.clearPending()
    this.queue = []
    this.inflightCount = 0
    this.inflightWaiters = []
    this.ready = false
    this.callbacks.onStateChange?.('disconnected')
  }

  isReady(): boolean {
    return this.ready
  }

  // ── 内部 ──

  /** 静音 / 强制切分 触发条件满足时把当前 pending 入队 + 启动并行推理 */
  private maybeFlush(): void {
    const durSec = this.pendingByteLen / 2 / SAMPLE_RATE
    const silentMs = (this.silentFramesInPending / SAMPLE_RATE) * 1000

    // 触发条件：本段有语音 + 静音超阈值 + 段够长
    // 注意：只看 pendingHasVoice（pending 段级），不查 sessionHadVoice
    const silenceTriggered = this.pendingHasVoice && silentMs >= SILENCE_FLUSH_MS && durSec >= MIN_SEGMENT_SEC
    const maxTriggered = durSec >= MAX_SEGMENT_SEC
    if (!silenceTriggered && !maxTriggered) return

    const b64 = this.encodePending()
    this.queue.push({ audioB64: b64, durationSec: durSec })
    this.clearPending()
    // 只重置 pending 段的状态；sessionHadVoice 保持不变，
    // 这样 stop() 仍能判断"本轮是否曾说过话"以决定是否送尾部
    this.silentFramesInPending = 0
    this.pendingHasVoice = false

    this.launchAllSegments()
  }

  /** 启动队列里所有段（fire-and-forget）；多次调用安全（同段不会重复） */
  private launchAllSegments(): void {
    const seq = this.runSeq
    while (this.queue.length > 0) {
      const seg = this.queue.shift()!
      this.inflightCount += 1
      this.transcribe(seg.audioB64)
        .then((r) => {
          // 本轮已被中止（用户在处理中重新录音）：丢弃旧段结果，
          // 既不写入 seenPartialTexts 也不推 partial
          if (seq !== this.runSeq) return
          const text = (r.text || '').trim()
          if (text) {
            this.seenPartialTexts.push(text)
            // 录音期间推 isFinal=false；stop 后推 isFinal=true（settled=true）
            if (this.sessionActive) {
              this.callbacks.onPartial?.(text, false)
            } else if (this.settled) {
              this.callbacks.onPartial?.(text, true)
            }
          }
        })
        .catch((err) => {
          addRuntimeEvent('warn', 'local', '分段 ASR 失败', { error: String(err) })
        })
        .finally(() => {
          this.inflightCount -= 1
          if (this.inflightCount === 0) {
            const ws = this.inflightWaiters
            this.inflightWaiters = []
            ws.forEach((fn) => fn())
          }
        })
    }
  }

  private waitForInflight(): Promise<void> {
    if (this.inflightCount === 0) return Promise.resolve()
    return new Promise<void>((resolve) => {
      this.inflightWaiters.push(resolve)
    })
  }

  /** stop 时调用：等所有 in-flight 完成 → 推 onFinal（基于已推送 partial 拼装）
   *
   *  关键：必须保证 `seenPartialTexts` 在推 onFinal 时包含了**最后一个**段的文字。
   *  之前用 5s 超时立即推 final — 如果最后一段 IPC 超过 5s 还在飞，
   *  `seenPartialTexts.push(text)` 还没执行就提前 final → 漏字。
   *
   *  现在策略：单纯 await 等所有 in-flight（无超时）；只有当 inflight 卡死
   *  （极端情况）才走 60s 兜底——60s 后即使还有 inflight 也推 final，
   *  避免 UI 永远卡在 processing。
   *
   *  60s 与 helpers.ts 的 computeProcessingTimeoutMs 上限对齐（local 模式 120s，
   *  Orchestrator 的 processing timeout 通常 ≥ 60s），保证 Orchestrator 不会
   *  在我们还没推 onFinal 前就 resetToIdle。 */
  private static readonly INFLIGHT_FINAL_TIMEOUT_MS = 60_000

  private async waitInflightThenFinalize(): Promise<void> {
    const seq = this.runSeq
    await Promise.race([
      this.waitForInflight(),
      new Promise<void>((r) => setTimeout(r, LocalProvider.INFLIGHT_FINAL_TIMEOUT_MS)),
    ])

    // 本轮已被中止（用户在处理中重新录音）：不再推 final，
    // 否则上一次录音的文字会被当作本轮结果注入
    if (seq !== this.runSeq) {
      addRuntimeEvent('info', 'local', '本轮已中止，丢弃旧 run 的 final', {
        droppedChars: this.seenPartialTexts.join('').length,
      })
      return
    }

    const fullText = this.seenPartialTexts
      .map((t) => t.replace(/[\r\n]+/g, ' '))
      .filter((t) => t.length > 0)
      .join('')
      .trim()
    const totalDur = (Date.now() - this.sessionStartMs) / 1000

    addRuntimeEvent('info', 'local', '本地 ASR 完成', {
      segments: this.seenPartialTexts.length,
      chars: fullText.length,
      durSec: totalDur,
      droppedInflight: this.inflightCount,
    })

    // 兜底：如果超时触发时还有 in-flight，把这部分**已经在 Rust 端排队**
    // 但还没解析的段标记出来，让用户从日志能看到"可能有文字被吞"。
    if (this.inflightCount > 0) {
      addRuntimeEvent('warn', 'local', `⚠️ ${LocalProvider.INFLIGHT_FINAL_TIMEOUT_MS / 1000}s 超时但仍有 in-flight 段未完成 — 可能漏字`, {
        pendingInflight: this.inflightCount,
        seenChars: fullText.length,
        timeoutMs: LocalProvider.INFLIGHT_FINAL_TIMEOUT_MS,
      })
    }

    if (this.callbacks.onFinal) {
      this.callbacks.onFinal({
        asrText: fullText,
        llmText: fullText,
        asrMs: 0,
        llmMs: 0,
        durationSec: totalDur,
        asrEngine: 'local',
        asrModel: 'sensevoice',
      })
    }
    this.callbacks.onDone?.()
  }

  private async transcribe(audioB64: string): Promise<{ text: string; elapsed_ms: number }> {
    return invoke<{ text: string; elapsed_ms: number }>('local_transcribe', {
      audioB64,
      modelId: await getSetting('localAsr.modelId', 'sensevoice-small'),
      language: await getSetting('localAsr.language', 'auto'),
    })
  }

  private encodePending(): string {
    const merged = new Uint8Array(this.pendingByteLen)
    let offset = 0
    for (const buf of this.pendingChunks) {
      merged.set(new Uint8Array(buf), offset)
      offset += buf.byteLength
    }
    return uint8ArrayToBase64(merged)
  }

  private clearPending(): void {
    this.pendingChunks = []
    this.pendingByteLen = 0
  }
}
