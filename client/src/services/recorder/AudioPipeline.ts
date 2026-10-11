// AudioPipeline — 录音数据流：采集回调 / 波形 / 静音检测 / 增量写盘 / finalize
//
// 职责：
// 1. 接 startCapture 的 onBuffer + onPCMFrame 回调
// 2. 累积 recordedChunks（用于增量写盘 + 历史保存）
// 3. 推波形 bars 到 overlay
// 4. 计算 RMS / 低音量告警 → 推 overlay
// 5. 每 5s 增量 flush 到磁盘（避免长录音内存堆积）
// 6. finalizeAudioFile：录音结束时修补 WAV header
//
// 不负责：选区、ASR 调用、AI chat、文本注入、状态机切换（这些都在 Orchestrator / 其他子模块）

import * as bridge from '../bridge'
import { addRuntimeEvent } from '../debugLog'
import { uint8ArrayToBase64 } from '@/lib/encoding'
import { createWaveformBarState, computeBarsFromPCM, getLastFrameRms, getLastPeakAmplitude, resetWaveformBarState, type WaveformBarState } from '../waveform'
import type { OverlayService } from './OverlayService'
import type { RecorderContext } from './types'
import {
  AUDIO_FLUSH_INTERVAL_MS,
  LOW_VOLUME_FIRST_WARN_SAMPLES,
  LOW_VOLUME_REWARN_MS,
  LOW_VOLUME_RMS_THRESHOLD,
  SILENCE_RMS_THRESHOLD,
} from './types'

export interface AudioStats {
  avgRms: number
  peakRms: number
  peakAmplitude: number
  silenceRatio: number
  totalFrames: number
}

export class AudioPipeline {
  /** 波形状态（仅本类使用） */
  private readonly overlayWaveState: WaveformBarState = createWaveformBarState()

  // ── 增量写盘（仅本类使用）──
  private audioFlushTimerId: ReturnType<typeof setInterval> | null = null
  private incrementalRecordId = ''
  private incrementalFirstChunkWritten = false
  private incrementalWrittenBytes = 0
  private lastFlushedSamples = 0

  // ── 静音 / 音频统计（仅本类使用）──
  private consecutiveSilentSamples = 0
  private lastLowVolumeWarnAt = 0
  private audioStatsRmsSum = 0
  private audioStatsPeakRms = 0
  private audioStatsPeakAmplitude = 0
  private audioStatsSilentFrames = 0
  private audioStatsTotalFrames = 0

  constructor(
    private ctx: RecorderContext,
    private overlayService: OverlayService,
  ) {}

  /** startRecording 时调用：生成新的 incrementalRecordId + 重置所有内部状态 */
  startSession(): void {
    this.incrementalRecordId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    this.incrementalFirstChunkWritten = false
    this.incrementalWrittenBytes = 0
    this.lastFlushedSamples = 0
    this.audioStatsRmsSum = 0
    this.audioStatsPeakRms = 0
    this.audioStatsPeakAmplitude = 0
    this.audioStatsSilentFrames = 0
    this.audioStatsTotalFrames = 0
    this.consecutiveSilentSamples = 0
    this.lastLowVolumeWarnAt = 0
    this.ctx.recordedChunks = []
    this.ctx.audioSentSamples = 0
    this.startAudioFlushTimer()
    resetWaveformBarState(this.overlayWaveState, this.overlayService.getBarCount(), 3)
  }

  /** resetToIdle 时调用：停定时器 + 清内部计数器 */
  reset(): void {
    this.stopAudioFlushTimer()
    this.audioStatsRmsSum = 0
    this.audioStatsPeakRms = 0
    this.audioStatsPeakAmplitude = 0
    this.audioStatsSilentFrames = 0
    this.audioStatsTotalFrames = 0
    this.consecutiveSilentSamples = 0
    this.lastLowVolumeWarnAt = 0
    this.incrementalRecordId = ''
    this.incrementalFirstChunkWritten = false
    this.incrementalWrittenBytes = 0
    this.lastFlushedSamples = 0
  }

  /** startCapture 的 onBuffer 回调：累积 chunk + 转发给 provider.sendAudio */
  onAudioBuffer(buffer: ArrayBuffer): void {
    if (this.ctx.audioSentSamples === 0) {
      import('../debugConsole').then(({ devLog }) => {
        devLog('[ptt-diag] 首个 onData buffer', {
          byteLength: buffer.byteLength,
          samples: buffer.byteLength / 2,
        })
      })
    }
    // 直接 push，不复制。flush 时的 merge 会读这些 buffer，
    // 增删改的是 merge 产生的临时 Uint8Array，不影响 recordedChunks。
    this.ctx.recordedChunks.push(buffer)
  }

  /** startCapture 的 onPCMFrame 回调：波形 + RMS + 低音量告警 + 增量统计
   *
   * onPartialFrame 是给 PreviewEngine 用的（流式 ASR 预览切段），返回 boolean 表示
   * "本帧应继续推给 PreviewEngine"（仅 recording 状态 + previewEnabled + 非 in-flight）
   */
  onPcmFrame(pcmFrame: Int16Array): { continue: boolean } {
    this.ctx.audioSentSamples += pcmFrame.length
    const bars = computeBarsFromPCM(pcmFrame, this.overlayWaveState, {
      barCount: this.overlayService.getBarCount(),
      minHeight: 3,
      maxHeight: 18,
    })
    this.overlayService.pushListeningBars(bars)

    // ── 音频统计：复用 computeBarsFromPCM 内部已计算的 frameRms 和 peakAmplitude，
    //    避免对 PCM 数据二次遍历 ──
    const rms = getLastFrameRms()
    const peakNorm = getLastPeakAmplitude()

    this.audioStatsTotalFrames++
    this.audioStatsRmsSum += rms
    if (rms > this.audioStatsPeakRms) this.audioStatsPeakRms = rms
    if (peakNorm > this.audioStatsPeakAmplitude) this.audioStatsPeakAmplitude = peakNorm
    if (rms < SILENCE_RMS_THRESHOLD) this.audioStatsSilentFrames++

    // ── 低音量告警 ──
    if (rms < LOW_VOLUME_RMS_THRESHOLD) {
      this.consecutiveSilentSamples += pcmFrame.length
      if (this.consecutiveSilentSamples >= LOW_VOLUME_FIRST_WARN_SAMPLES) {
        const now = Date.now()
        if (now - this.lastLowVolumeWarnAt >= LOW_VOLUME_REWARN_MS) {
          this.lastLowVolumeWarnAt = now
          addRuntimeEvent('warn', 'recorder', '持续低音量，可能未检测到声音')
          this.overlayService.showLowVolumeWarning()
        }
      }
    } else {
      if (this.consecutiveSilentSamples >= LOW_VOLUME_FIRST_WARN_SAMPLES) {
        this.overlayService.clearWarning()
      }
      this.consecutiveSilentSamples = 0
    }

    // PCM 帧是否需要继续给 PreviewEngine 处理 — 由调用方根据 previewEnabled 决定
    return { continue: true }
  }

  /** stopRecording 时取一份音频统计快照 — 给 provider.stop() 作为 audioStats 入参 */
  snapshotStats(): AudioStats | undefined {
    if (this.audioStatsTotalFrames === 0) return undefined
    return {
      avgRms: Math.round((this.audioStatsRmsSum / this.audioStatsTotalFrames) * 10000) / 10000,
      peakRms: Math.round(this.audioStatsPeakRms * 10000) / 10000,
      peakAmplitude: Math.round(this.audioStatsPeakAmplitude * 10000) / 10000,
      silenceRatio: Math.round((this.audioStatsSilentFrames / this.audioStatsTotalFrames) * 1000) / 1000,
      totalFrames: this.audioStatsTotalFrames,
    }
  }

  /** stopRecording 时取纯静音比例（用于极短录音判定） */
  getSilenceRatio(): number {
    return this.audioStatsTotalFrames > 0
      ? this.audioStatsSilentFrames / this.audioStatsTotalFrames
      : 0
  }

  /** P2-5: 增量 flush 定时器 */
  private startAudioFlushTimer(): void {
    this.stopAudioFlushTimer()
    this.audioFlushTimerId = setInterval(() => {
      void this.flushRecordedChunksToDisk().catch((err) => {
        addRuntimeEvent('warn', 'recorder.audio-flush', '增量 flush 失败', { error: String(err) })
      })
    }, AUDIO_FLUSH_INTERVAL_MS)
  }

  private stopAudioFlushTimer(): void {
    if (this.audioFlushTimerId) {
      clearInterval(this.audioFlushTimerId)
      this.audioFlushTimerId = null
    }
  }

  /** 把累积 PCM 增量 flush 到磁盘并清空 recordedChunks。
   *  flush 失败时把数据放回 recordedChunks 头部（best-effort）。 */
  private async flushRecordedChunksToDisk(): Promise<void> {
    if (this.ctx.recordedChunks.length === 0) return

    const totalBytes = this.ctx.recordedChunks.reduce((s, c) => s + c.byteLength, 0)
    if (totalBytes === 0) {
      this.ctx.recordedChunks = []
      return
    }

    const merged = new Uint8Array(totalBytes)
    let off = 0
    for (const c of this.ctx.recordedChunks) {
      merged.set(new Uint8Array(c), off)
      off += c.byteLength
    }

    const isFirst = !this.incrementalFirstChunkWritten
    this.ctx.recordedChunks = []

    const audioB64 = uint8ArrayToBase64(merged)

    try {
      await bridge.appendPcmToWav(this.incrementalRecordId, audioB64, 16000, isFirst)
      this.incrementalFirstChunkWritten = true
      this.incrementalWrittenBytes += totalBytes
      this.lastFlushedSamples = this.ctx.audioSentSamples
    } catch (err) {
      addRuntimeEvent('warn', 'recorder.audio-flush', '增量 flush IPC 失败', {
        error: String(err),
        bufferBytes: totalBytes,
      })
    }
  }

  /** 录音停止：清空定时器 + flush 最后一段 + 修补 WAV header。
   *  返回最终文件路径，没录音或失败返回 null。 */
  async finalize(): Promise<string | null> {
    this.stopAudioFlushTimer()
    if (this.ctx.recordedChunks.length > 0) {
      await this.flushRecordedChunksToDisk()
    }
    if (!this.incrementalFirstChunkWritten) {
      return null
    }
    try {
      const path = await bridge.finalizeWavFile(this.incrementalRecordId, this.incrementalWrittenBytes)
      return path
    } catch (err) {
      addRuntimeEvent('warn', 'recorder.audio-flush', 'finalize WAV 失败', { error: String(err) })
      return null
    }
  }

  /** 是否已写过第一段（用于 saveRecordingAudio 兜底判定） */
  hasIncrementalData(): boolean {
    return this.incrementalFirstChunkWritten
  }

  get incrementalRecordIdSnapshot(): string {
    return this.incrementalRecordId
  }

  /** 用于 onError 路径主动清理残留的 incremental WAV */
  async cleanupIncomplete(): Promise<void> {
    if (this.incrementalFirstChunkWritten && this.incrementalRecordId) {
      try {
        await bridge.cleanupIncompleteWav(this.incrementalRecordId)
      } catch { /* ignore */ }
    }
  }
}