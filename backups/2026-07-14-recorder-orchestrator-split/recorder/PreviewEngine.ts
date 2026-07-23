// PreviewEngine — 流式 ASR 预览：把长录音切段 → 调 ASR → 推 overlay 文本
//
// 职责：
// 1. 接收 PCM 帧回调（从 startCapture.onPCMFrame）
// 2. 检测连续静默（1s）+ 段长阈值（0.5s）→ 触发切段识别
// 3. local 模式调 local_transcribe；cloud_api 模式调 cloud_transcribe（一次性）
// 4. 去重上推 previewText（避免相同文本重复推）
// 5. 单 in-flight 锁：避免 ASR 调用堆积
//
// 不负责：实际录音采集（那是 startCapture）、波形 bars（AudioPipeline）、状态机

import { invoke } from '@tauri-apps/api/core'
import { addRuntimeEvent } from '../debugLog'
import { uint8ArrayToBase64 } from '@/lib/encoding'
import type { OverlayService } from './OverlayService'
import type { RecorderContext } from './types'
import type { TranscriptionProvider } from '../transcription'
import {
  PREVIEW_MIN_SEG_SAMPLES,
  PREVIEW_SILENCE_RMS_THRESHOLD,
  PREVIEW_SILENCE_SAMPLES,
} from './types'

export interface PreviewEngineDeps {
  /** 预览开关（来自 SettingsCache） */
  isPreviewEnabled: () => boolean
  /** 当前 provider.mode getter */
  getProviderMode: () => TranscriptionProvider['mode']
}

export class PreviewEngine {
  private consecutiveSegmentSilentSamples = 0
  private previewSegmentBuffer: ArrayBuffer[] = []
  private previewSegmentSamples = 0
  private previewInFlight = false
  private lastPreviewText = ''
  private previewKeyCounter = 0
  /** 预览会话 sessionId — 给 cloud partial 路由用 */
  private previewSessionId: string | null = null

  constructor(
    private ctx: RecorderContext,
    private overlayService: OverlayService,
    private deps: PreviewEngineDeps,
  ) {}

  /** startRecording 时调用：生成新 sessionId + 清空段缓冲 */
  startSession(): void {
    this.previewSessionId = `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    this.previewSegmentBuffer = []
    this.previewSegmentSamples = 0
    this.consecutiveSegmentSilentSamples = 0
    this.previewInFlight = false
    this.lastPreviewText = ''
    this.previewKeyCounter = 0
    this.overlayService.clearListeningPreview()
  }

  /** resetToIdle 时调用：清内部状态（不取消 in-flight — 下次录音会新生成 sessionId 隔离） */
  reset(): void {
    this.previewSegmentBuffer = []
    this.previewSegmentSamples = 0
    this.consecutiveSegmentSilentSamples = 0
    this.previewInFlight = false
    this.lastPreviewText = ''
    this.previewSessionId = null
    this.overlayService.clearListeningPreview()
  }

  /** 暴露给 cloud_api provider 用于 partial 事件路由 */
  getPreviewSessionId(): string | null {
    return this.previewSessionId
  }

  /** Provider 的 onPartial 回调入口：把 streaming ASR 中间结果推到 overlay。
   *  仅 recording 状态下处理；与切段识别互不干扰（流式天然无 in-flight 冲突）。 */
  onProviderPartial(text: string, isFinal: boolean): void {
    if (this.ctx.state !== 'recording') return
    if (!this.deps.isPreviewEnabled()) return
    const trimmed = (text || '').trim()
    if (!trimmed) return
    if (trimmed === this.lastPreviewText) return
    this.lastPreviewText = trimmed
    this.previewKeyCounter += 1
    this.overlayService.pushListeningPreview(trimmed, this.previewKeyCounter)
    addRuntimeEvent('info', 'recorder.preview', 'partial 推送', {
      textLen: trimmed.length,
      isFinal,
    })
  }

  /** PCM 帧回调入口（由 Orchestrator 在 onPcmFrame 之后调用）：
   *  - 累积到 segment buffer
   *  - 检测静默达 1s + 段长 ≥ 0.5s → 触发切段识别
   */
  onPcmFrame(pcmFrame: Int16Array, rms: number): void {
    if (!this.deps.isPreviewEnabled() || this.previewInFlight) return

    // 累积（复制到独立 ArrayBuffer 避免 SharedArrayBuffer 隐患）
    const pcmBytes = new Uint8Array(pcmFrame.buffer, pcmFrame.byteOffset, pcmFrame.byteLength)
    const copiedBuf = pcmBytes.slice().buffer as ArrayBuffer
    this.previewSegmentBuffer.push(copiedBuf)
    this.previewSegmentSamples += pcmFrame.length

    if (rms < PREVIEW_SILENCE_RMS_THRESHOLD) {
      this.consecutiveSegmentSilentSamples += pcmFrame.length
      if (
        this.consecutiveSegmentSilentSamples >= PREVIEW_SILENCE_SAMPLES &&
        this.previewSegmentSamples >= PREVIEW_MIN_SEG_SAMPLES
      ) {
        // snapshot + 清空 buffer + 重置计数器
        const segBuffers = this.previewSegmentBuffer
        const segSamples = this.previewSegmentSamples
        this.previewSegmentBuffer = []
        this.previewSegmentSamples = 0
        this.consecutiveSegmentSilentSamples = 0
        void this.transcribeSegmentPreview(segBuffers, segSamples)
      }
    } else {
      this.consecutiveSegmentSilentSamples = 0
    }
  }

  /** 把段 PCM 缓冲合并为 base64 并调用对应 ASR。 */
  private async transcribeSegmentPreview(segBuffers: ArrayBuffer[], segSamples: number): Promise<void> {
    if (this.previewInFlight) return
    if (!this.deps.isPreviewEnabled()) return
    if (this.ctx.state !== 'recording') return
    if (segBuffers.length === 0 || segSamples < PREVIEW_MIN_SEG_SAMPLES) return

    const mode = this.deps.getProviderMode()
    if (mode === 'server') return

    const totalBytes = segBuffers.reduce((s, b) => s + b.byteLength, 0)
    const merged = new Uint8Array(totalBytes)
    let off = 0
    for (const b of segBuffers) {
      merged.set(new Uint8Array(b), off)
      off += b.byteLength
    }
    const audioB64 = uint8ArrayToBase64(merged)
    const durationSec = segSamples / 16000

    this.previewInFlight = true
    addRuntimeEvent('info', 'recorder.preview', '预览段开始识别', {
      mode,
      durationSec,
      samples: segSamples,
      bytes: totalBytes,
    })

    try {
      let text = ''
      if (mode === 'local') {
        text = await this.transcribeLocalSegment(audioB64)
      } else if (mode === 'cloud_api') {
        text = await this.transcribeCloudSegment(audioB64, durationSec)
      }

      // 录音可能已结束（异步），再次校验
      if (this.ctx.state !== 'recording') return
      text = (text || '').trim()
      if (!text) return
      if (text === this.lastPreviewText) return

      this.lastPreviewText = text
      this.previewKeyCounter += 1
      this.overlayService.pushListeningPreview(text, this.previewKeyCounter)
      addRuntimeEvent('info', 'recorder.preview', '预览段识别完成', {
        textLen: text.length,
        durationSec,
      })
    } catch (err) {
      addRuntimeEvent('warn', 'recorder.preview', '预览段识别失败（已忽略）', {
        mode,
        error: String(err),
      })
    } finally {
      this.previewInFlight = false
    }
  }

  private async transcribeLocalSegment(audioB64: string): Promise<string> {
    const result = await invoke<{ text: string; elapsed_ms: number }>('local_transcribe', {
      audioB64,
      modelId: 'sensevoice-small',
      language: 'auto',
    })
    return result.text
  }

  private async transcribeCloudSegment(audioB64: string, durationSec: number): Promise<string> {
    const result = await invoke<{ text: string; elapsed_ms: number }>('cloud_transcribe', {
      request: { audio_b64: audioB64, duration_sec: durationSec },
    })
    return result.text
  }
}