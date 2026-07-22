import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ─── Mocks（必须在 import 之前） ───
vi.mock('../../bridge', () => ({
  appendPcmToWav: vi.fn().mockResolvedValue(undefined),
  finalizeWavFile: vi.fn().mockResolvedValue('/tmp/final.wav'),
  cleanupIncompleteWav: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../debugLog', () => ({
  addRuntimeEvent: vi.fn(),
}))

vi.mock('../../debugConsole', () => ({
  devLog: vi.fn(),
}))

import { INITIAL_CONTEXT, type RecorderContext } from '../types'
import { AudioPipeline } from '../AudioPipeline'
import * as bridge from '../../bridge'

// ─── PCM 测试数据构造 ───
function silencePcm(n: number, amp = 0): Int16Array {
  const p = new Int16Array(n)
  for (let i = 0; i < n; i++) p[i] = amp
  return p
}

function loudPcm(n: number, amp = 30000): Int16Array {
  // 满幅方波，RMS ≈ amp/32768
  const p = new Int16Array(n)
  for (let i = 0; i < n; i++) p[i] = i % 2 === 0 ? amp : -amp
  return p
}

function nearSilenceRmsPcm(n: number, amp = 60): Int16Array {
  // amp=60 → RMS ≈ 60/32768 ≈ 0.00183
  // < SILENCE_RMS_THRESHOLD (0.01) 计入静默
  // > LOW_VOLUME_RMS_THRESHOLD (0.0003) 不触发低音量告警
  const p = new Int16Array(n)
  for (let i = 0; i < n; i++) p[i] = amp
  return p
}

function trulyQuietPcm(n: number, amp = 5): Int16Array {
  // amp=5 → RMS ≈ 5/32768 ≈ 0.000153 < LOW_VOLUME 0.0003 → 触发低音量告警
  const p = new Int16Array(n)
  for (let i = 0; i < n; i++) p[i] = amp
  return p
}

// ─── OverlayService stub ───
function makeOverlayStub(barCount = 18) {
  return {
    getBarCount: vi.fn().mockReturnValue(barCount),
    pushListeningBars: vi.fn(),
    showLowVolumeWarning: vi.fn(),
    clearWarning: vi.fn(),
  }
}

describe('AudioPipeline', () => {
  let ctx: RecorderContext
  let overlay: ReturnType<typeof makeOverlayStub>
  let pipe: AudioPipeline

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-14T00:00:00Z'))
    ctx = { ...INITIAL_CONTEXT, state: 'recording' }
    overlay = makeOverlayStub()
    pipe = new AudioPipeline(ctx, overlay as any)
    pipe.startSession()
  })

  afterEach(() => {
    pipe.reset()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  // ─── startSession / reset ───

  describe('startSession', () => {
    it('生成 incrementalRecordId 非空', () => {
      expect(pipe.incrementalRecordIdSnapshot).not.toBe('')
      expect(pipe.incrementalRecordIdSnapshot.length).toBeGreaterThan(0)
    })

    it('清空 recordedChunks + 重置 audioSentSamples', () => {
      ctx.recordedChunks.push(new ArrayBuffer(100))
      ctx.audioSentSamples = 9999
      pipe.reset()
      pipe.startSession()
      expect(ctx.recordedChunks).toEqual([])
      expect(ctx.audioSentSamples).toBe(0)
    })

    it('重置 waveform bar state（调 overlay.getBarCount）', () => {
      // startSession 第 76 行会调 overlayService.getBarCount() 一次
      // 后续 onPcmFrame 还会调
      expect(overlay.getBarCount).toHaveBeenCalled()
    })
  })

  describe('reset', () => {
    it('清空 incrementalRecordId', () => {
      pipe.reset()
      expect(pipe.incrementalRecordIdSnapshot).toBe('')
    })

    it('hasIncrementalData 返回 false', () => {
      pipe.reset()
      expect(pipe.hasIncrementalData()).toBe(false)
    })
  })

  // ─── onAudioBuffer ───

  describe('onAudioBuffer', () => {
    it('把 buffer 推进 recordedChunks', () => {
      const buf = new ArrayBuffer(1600)
      pipe.onAudioBuffer(buf)
      expect(ctx.recordedChunks.length).toBe(1)
      expect(ctx.recordedChunks[0].byteLength).toBe(1600)
    })

    it('存的是 buffer 的 copy（原 buffer 变更不影响）', () => {
      const buf = new ArrayBuffer(4)
      new Int16Array(buf)[0] = 100
      pipe.onAudioBuffer(buf)
      new Int16Array(buf)[0] = 200
      expect(new Int16Array(ctx.recordedChunks[0])[0]).toBe(100)
    })
  })

  // ─── onPcmFrame 波形 + RMS ───

  describe('onPcmFrame', () => {
    it('累加 audioSentSamples', () => {
      pipe.onPcmFrame(silencePcm(800))
      pipe.onPcmFrame(silencePcm(800))
      pipe.onPcmFrame(silencePcm(800))
      expect(ctx.audioSentSamples).toBe(2400)
    })

    it('推 bars 给 overlay，长度 = barCount', () => {
      pipe.onPcmFrame(silencePcm(800))
      expect(overlay.pushListeningBars).toHaveBeenCalledTimes(1)
      const bars = overlay.pushListeningBars.mock.calls[0][0]
      expect(bars).toHaveLength(18)
    })

    it('始终返回 { continue: true }', () => {
      const result = pipe.onPcmFrame(silencePcm(800))
      expect(result).toEqual({ continue: true })
    })

    it('loud PCM 的 peakRms ≈ 0.92', () => {
      pipe.onPcmFrame(loudPcm(800))
      const stats = pipe.snapshotStats()!
      expect(stats.peakRms).toBeGreaterThan(0.9)
      expect(stats.peakRms).toBeLessThan(1.0)
    })

    it('loud PCM 的 peakAmplitude ≈ 0.92（30000/32768）', () => {
      pipe.onPcmFrame(loudPcm(800))
      const stats = pipe.snapshotStats()!
      expect(stats.peakAmplitude).toBeCloseTo(30000 / 32768, 2)
    })

    it('纯静音 5 帧后 silenceRatio === 1', () => {
      for (let i = 0; i < 5; i++) pipe.onPcmFrame(silencePcm(800))
      expect(pipe.getSilenceRatio()).toBe(1)
      const stats = pipe.snapshotStats()!
      expect(stats.silenceRatio).toBe(1)
      expect(stats.totalFrames).toBe(5)
    })

    it('near-silence（amp=60）RMS 计入静默（< 0.01）但不触发低音量告警', () => {
      for (let i = 0; i < 3; i++) pipe.onPcmFrame(nearSilenceRmsPcm(800))
      expect(pipe.getSilenceRatio()).toBe(1)
      expect(overlay.showLowVolumeWarning).not.toHaveBeenCalled()
    })
  })

  // ─── 低音量告警 ───

  describe('低音量告警', () => {
    it('3s 持续低音量后第一次触发 showLowVolumeWarning', () => {
      // LOW_VOLUME_FIRST_WARN_SAMPLES = 48000 → 4 帧 × 12000
      for (let i = 0; i < 4; i++) pipe.onPcmFrame(trulyQuietPcm(12000))
      expect(overlay.showLowVolumeWarning).toHaveBeenCalledTimes(1)
    })

    it('5s 内不重复警告', () => {
      for (let i = 0; i < 4; i++) pipe.onPcmFrame(trulyQuietPcm(12000))
      expect(overlay.showLowVolumeWarning).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(4000)
      // 又累积了 4 帧低音量，但距上次警告 < 5s
      for (let i = 0; i < 4; i++) pipe.onPcmFrame(trulyQuietPcm(12000))
      expect(overlay.showLowVolumeWarning).toHaveBeenCalledTimes(1)
    })

    it('5s 后再次低音量可重复警告', () => {
      for (let i = 0; i < 4; i++) pipe.onPcmFrame(trulyQuietPcm(12000))
      vi.advanceTimersByTime(6000)
      // 累积到阈值后再发一帧
      for (let i = 0; i < 4; i++) pipe.onPcmFrame(trulyQuietPcm(12000))
      expect(overlay.showLowVolumeWarning).toHaveBeenCalledTimes(2)
    })

    it('恢复有声后调 clearWarning 并重置连续静默计数器', () => {
      for (let i = 0; i < 4; i++) pipe.onPcmFrame(trulyQuietPcm(12000))
      expect(overlay.showLowVolumeWarning).toHaveBeenCalledTimes(1)
      pipe.onPcmFrame(loudPcm(800))
      expect(overlay.clearWarning).toHaveBeenCalled()
      // lastLowVolumeWarnAt 不重置，所以紧接着 3s 静默 < 5s 间隔，不会再警告
      overlay.showLowVolumeWarning.mockClear()
      for (let i = 0; i < 4; i++) pipe.onPcmFrame(trulyQuietPcm(12000))
      expect(overlay.showLowVolumeWarning).not.toHaveBeenCalled()
    })
  })

  // ─── snapshotStats / getSilenceRatio ───

  describe('snapshotStats', () => {
    it('无帧时返回 undefined', () => {
      expect(pipe.snapshotStats()).toBeUndefined()
    })

    it('结果保留 4 位小数', () => {
      pipe.onPcmFrame(loudPcm(800))
      const stats = pipe.snapshotStats()!
      // Math.round(x * 10000) / 10000 → 4 位小数
      const decimalPlaces = (n: number) => {
        const s = n.toString()
        const dot = s.indexOf('.')
        return dot === -1 ? 0 : s.length - dot - 1
      }
      expect(decimalPlaces(stats.avgRms)).toBeLessThanOrEqual(4)
      expect(decimalPlaces(stats.peakRms)).toBeLessThanOrEqual(4)
    })
  })

  describe('getSilenceRatio', () => {
    it('无帧时返回 0', () => {
      expect(pipe.getSilenceRatio()).toBe(0)
    })
  })

  // ─── 增量 flush 定时器 ───

  describe('flushRecordedChunksToDisk (via setInterval)', () => {
    it('5s 后调起 appendPcmToWav', async () => {
      ctx.recordedChunks.push(new ArrayBuffer(1600)) // 800 samples @ 16kHz
      await vi.advanceTimersByTimeAsync(AUDIO_FLUSH_INTERVAL_MS_FOR_TEST)
      expect(bridge.appendPcmToWav).toHaveBeenCalled()
    })

    it('空 recordedChunks 不调 IPC', async () => {
      await vi.advanceTimersByTimeAsync(AUDIO_FLUSH_INTERVAL_MS_FOR_TEST)
      expect(bridge.appendPcmToWav).not.toHaveBeenCalled()
    })

    it('appendPcmToWav 首调 isFirst=true，后续 false', async () => {
      // 第一次 flush
      ctx.recordedChunks.push(new ArrayBuffer(1600))
      await vi.advanceTimersByTimeAsync(AUDIO_FLUSH_INTERVAL_MS_FOR_TEST)
      expect(bridge.appendPcmToWav).toHaveBeenCalledTimes(1)
      const firstCall = (bridge.appendPcmToWav as any).mock.calls[0]
      expect(firstCall[3]).toBe(true) // isFirst

      // 第二次 flush
      ctx.recordedChunks.push(new ArrayBuffer(1600))
      await vi.advanceTimersByTimeAsync(AUDIO_FLUSH_INTERVAL_MS_FOR_TEST)
      expect(bridge.appendPcmToWav).toHaveBeenCalledTimes(2)
      const secondCall = (bridge.appendPcmToWav as any).mock.calls[1]
      expect(secondCall[3]).toBe(false) // not isFirst
    })

    it('appendPcmToWav 失败时回滚 recordedChunks', async () => {
      ctx.recordedChunks.push(new ArrayBuffer(1600))
      ;(bridge.appendPcmToWav as any).mockRejectedValueOnce(new Error('IPC failed'))
      await vi.advanceTimersByTimeAsync(AUDIO_FLUSH_INTERVAL_MS_FOR_TEST)
      // 失败时回滚到 recordedChunks 头部
      expect(ctx.recordedChunks.length).toBeGreaterThan(0)
    })
  })

  // ─── finalize ───

  describe('finalize', () => {
    it('无数据时返回 null', async () => {
      // 没 startSession 或没 flush 任何东西
      const freshPipe = new AudioPipeline(ctx, overlay as any)
      // 不调 startSession
      const result = await freshPipe.finalize()
      expect(result).toBeNull()
    })

    it('flush 后调 finalizeWavFile 并返回路径', async () => {
      // 先模拟成功 flush
      ctx.recordedChunks.push(new ArrayBuffer(1600))
      await pipe.finalize()
      expect(bridge.finalizeWavFile).toHaveBeenCalled()
      // 已在 mockResolvedValue('/tmp/final.wav')
    })

    it('finalizeWavFile 失败时返回 null', async () => {
      ctx.recordedChunks.push(new ArrayBuffer(1600))
      ;(bridge.finalizeWavFile as any).mockRejectedValueOnce(new Error('finalize failed'))
      const result = await pipe.finalize()
      expect(result).toBeNull()
    })
  })

  // ─── cleanupIncomplete ───

  describe('cleanupIncomplete', () => {
    it('incrementalFirstChunkWritten=false 时不调 IPC', async () => {
      // pipe 刚 startSession，没 flush
      await pipe.cleanupIncomplete()
      expect(bridge.cleanupIncompleteWav).not.toHaveBeenCalled()
    })

    it('incrementalFirstChunkWritten=true 时调 cleanupIncompleteWav', async () => {
      ctx.recordedChunks.push(new ArrayBuffer(1600))
      await vi.advanceTimersByTimeAsync(AUDIO_FLUSH_INTERVAL_MS_FOR_TEST)
      expect(pipe.hasIncrementalData()).toBe(true)
      await pipe.cleanupIncomplete()
      expect(bridge.cleanupIncompleteWav).toHaveBeenCalledWith(pipe.incrementalRecordIdSnapshot)
    })

    it('cleanupIncompleteWav 抛错不外抛', async () => {
      ctx.recordedChunks.push(new ArrayBuffer(1600))
      await vi.advanceTimersByTimeAsync(AUDIO_FLUSH_INTERVAL_MS_FOR_TEST)
      ;(bridge.cleanupIncompleteWav as any).mockRejectedValueOnce(new Error('cleanup failed'))
      await expect(pipe.cleanupIncomplete()).resolves.toBeUndefined()
    })
  })
})

// 集中常量（避免在多处 import）
const AUDIO_FLUSH_INTERVAL_MS_FOR_TEST = 5000
