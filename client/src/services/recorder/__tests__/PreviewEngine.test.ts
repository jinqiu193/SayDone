import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── Mocks ───
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('../../debugLog', () => ({
  addRuntimeEvent: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'
import { INITIAL_CONTEXT, type RecorderContext } from '../types'
import { PreviewEngine, type PreviewEngineDeps } from '../PreviewEngine'

// ─── Helper ───
function makeDeps(overrides: Partial<PreviewEngineDeps> = {}): PreviewEngineDeps {
  return {
    isPreviewEnabled: vi.fn().mockReturnValue(true),
    getProviderMode: vi.fn().mockReturnValue('local' as const),
    ...overrides,
  }
}

function makeOverlayStub() {
  return {
    pushListeningPreview: vi.fn(),
    clearListeningPreview: vi.fn(),
  }
}

function pcm(n: number, amp = 0): Int16Array {
  const p = new Int16Array(n)
  for (let i = 0; i < n; i++) p[i] = amp
  return p
}

const PREVIEW_MIN_SEG_SAMPLES = 8000
const PREVIEW_SILENCE_SAMPLES = 16000

describe('PreviewEngine', () => {
  let ctx: RecorderContext
  let overlay: ReturnType<typeof makeOverlayStub>
  let deps: PreviewEngineDeps
  let engine: PreviewEngine

  beforeEach(() => {
    vi.clearAllMocks()
    ctx = { ...INITIAL_CONTEXT, state: 'recording' }
    overlay = makeOverlayStub()
    deps = makeDeps()
    engine = new PreviewEngine(ctx, overlay as any, deps)
    engine.startSession()
  })

  // ─── startSession / reset ───

  describe('startSession', () => {
    it('生成 previewSessionId 非空', () => {
      const sid = engine.getPreviewSessionId()
      expect(sid).not.toBeNull()
      expect(sid).toMatch(/^rec_/)
    })

    it('调 overlay.clearListeningPreview', () => {
      expect(overlay.clearListeningPreview).toHaveBeenCalled()
    })
  })

  describe('reset', () => {
    it('previewSessionId 设为 null', () => {
      engine.reset()
      expect(engine.getPreviewSessionId()).toBeNull()
    })
  })

  // ─── onProviderPartial ───

  describe('onProviderPartial', () => {
    it('非 recording 状态时不推', () => {
      ctx.state = 'idle'
      engine.onProviderPartial('hi', false)
      expect(overlay.pushListeningPreview).not.toHaveBeenCalled()
    })

    it('preview 关闭时不推', () => {
      ;(deps.isPreviewEnabled as any).mockReturnValue(false)
      engine.onProviderPartial('hi', false)
      expect(overlay.pushListeningPreview).not.toHaveBeenCalled()
    })

    it('空文本不推', () => {
      engine.onProviderPartial('', false)
      engine.onProviderPartial('   ', false)
      expect(overlay.pushListeningPreview).not.toHaveBeenCalled()
    })

    it('相同文本不重复推', () => {
      engine.onProviderPartial('hello', false)
      engine.onProviderPartial('hello', false)
      expect(overlay.pushListeningPreview).toHaveBeenCalledTimes(1)
    })

    it('不同文本用递增 key 推', () => {
      engine.onProviderPartial('hello', false)
      engine.onProviderPartial('world', false)
      expect(overlay.pushListeningPreview).toHaveBeenCalledTimes(2)
      expect(overlay.pushListeningPreview).toHaveBeenNthCalledWith(1, 'hello', 1)
      expect(overlay.pushListeningPreview).toHaveBeenNthCalledWith(2, 'world', 2)
    })
  })

  // ─── onPcmFrame ───

  describe('onPcmFrame', () => {
    it('preview 关闭时不累积', () => {
      ;(deps.isPreviewEnabled as any).mockReturnValue(false)
      engine.onPcmFrame(pcm(800), 0)
      // 累积内部状态无法直接观察，但通过后续行为验证
      // （关闭时不应该触发任何 invoke 或 push）
      expect(invoke).not.toHaveBeenCalled()
      expect(overlay.pushListeningPreview).not.toHaveBeenCalled()
    })

    it('in-flight 锁阻止累积（不调 invoke）', async () => {
      // 用一个不自动 resolve 的 promise 模拟 in-flight
      let resolveInvoke: (v: any) => void = () => {}
      const pending = new Promise(r => { resolveInvoke = r })
      ;(invoke as any).mockReturnValue(pending)

      // 累积 1.5s speech + 1s silence → 触发切段（invoke 开始等待）
      for (let i = 0; i < 12; i++) engine.onPcmFrame(pcm(1000, 1000), 0.05)
      engine.onPcmFrame(pcm(16000, 0), 0)

      // 等微任务让 transcribeSegmentPreview 跑到第一个 await
      await new Promise(r => setTimeout(r, 0))
      expect(invoke).toHaveBeenCalledTimes(1)

      // in-flight 期间再发帧，应被锁住（不进 transcribeSegmentPreview）
      engine.onPcmFrame(pcm(1000, 1000), 0.05)
      engine.onPcmFrame(pcm(16000, 0), 0)
      await new Promise(r => setTimeout(r, 0))

      // 仍然只调了 1 次 invoke
      expect(invoke).toHaveBeenCalledTimes(1)

      // resolve 后清理
      resolveInvoke({ text: 'first', elapsed_ms: 50 })
      await new Promise(r => setTimeout(r, 0))
    })

    it('RMS >= 0.005 的帧重置 consecutiveSegmentSilentSamples', () => {
      // 先几帧静默
      engine.onPcmFrame(pcm(800, 0), 0)
      // 然后 loud 帧
      engine.onPcmFrame(pcm(800, 1000), 0.05)
      // 紧接着 1s 静默不足以触发切段（因为 counter 被重置）
      engine.onPcmFrame(pcm(800, 0), 0)
      // 不调 invoke（因为没有达到 PREVIEW_SILENCE_SAMPLES 累计）
      expect(invoke).not.toHaveBeenCalled()
    })

    it('总 samples < PREVIEW_MIN_SEG_SAMPLES 不切段', () => {
      // 只 0.7s silence，total = 7000 < 8000 (MIN_SEG) 且 silence < 16000 (SILENCE)
      for (let i = 0; i < 7; i++) engine.onPcmFrame(pcm(1000, 0), 0)
      expect(invoke).not.toHaveBeenCalled()
    })

    it('达到 speech ≥ 0.5s + silence ≥ 1s 时切段（local）', async () => {
      ;(invoke as any).mockResolvedValue({ text: 'segment text', elapsed_ms: 100 })
      // 1s speech (16000 > 8000)
      for (let i = 0; i < 16; i++) engine.onPcmFrame(pcm(1000, 1000), 0.05)
      // 1s silence (16000 samples)
      engine.onPcmFrame(pcm(16000, 0), 0)
      // 等异步
      await new Promise(r => setTimeout(r, 10))
      expect(invoke).toHaveBeenCalledWith('local_transcribe', expect.objectContaining({
        modelId: 'sensevoice-small',
        language: 'auto',
      }))
    })
  })

  // ─── transcribeSegmentPreview ───

  describe('transcribeSegmentPreview 内部行为', () => {
    it('未知 mode 不调 invoke', async () => {
      ;(deps.getProviderMode as any).mockReturnValue('unknown')
      for (let i = 0; i < 16; i++) engine.onPcmFrame(pcm(1000, 1000), 0.05)
      engine.onPcmFrame(pcm(16000, 0), 0)
      await new Promise(r => setTimeout(r, 10))
      expect(invoke).not.toHaveBeenCalled()
    })

    it('cloud_api 模式调 cloud_transcribe', async () => {
      ;(deps.getProviderMode as any).mockReturnValue('cloud_api')
      ;(invoke as any).mockResolvedValue({ text: 'cloud text', elapsed_ms: 200 })
      for (let i = 0; i < 16; i++) engine.onPcmFrame(pcm(1000, 1000), 0.05)
      engine.onPcmFrame(pcm(16000, 0), 0)
      await new Promise(r => setTimeout(r, 10))
      expect(invoke).toHaveBeenCalledWith('cloud_transcribe', expect.objectContaining({
        request: expect.objectContaining({ duration_sec: expect.any(Number) }),
      }))
    })

    it('race stop：invoke resolve 后 state ≠ recording 不推', async () => {
      ;(invoke as any).mockImplementation(async () => {
        ctx.state = 'idle' // 模拟 stop 先到
        return { text: 'should be dropped', elapsed_ms: 50 }
      })
      for (let i = 0; i < 16; i++) engine.onPcmFrame(pcm(1000, 1000), 0.05)
      engine.onPcmFrame(pcm(16000, 0), 0)
      await new Promise(r => setTimeout(r, 10))
      expect(overlay.pushListeningPreview).not.toHaveBeenCalled()
    })

    it('空文本不推（trim 后）', async () => {
      ;(invoke as any).mockResolvedValue({ text: '   ', elapsed_ms: 50 })
      for (let i = 0; i < 16; i++) engine.onPcmFrame(pcm(1000, 1000), 0.05)
      engine.onPcmFrame(pcm(16000, 0), 0)
      await new Promise(r => setTimeout(r, 10))
      expect(overlay.pushListeningPreview).not.toHaveBeenCalled()
    })

    it('与 lastPreviewText 重复不推', async () => {
      // 先推一次
      engine.onProviderPartial('same text', false)
      expect(overlay.pushListeningPreview).toHaveBeenCalledTimes(1)

      // 然后切段返回相同文本
      ;(invoke as any).mockResolvedValue({ text: 'same text', elapsed_ms: 50 })
      for (let i = 0; i < 16; i++) engine.onPcmFrame(pcm(1000, 1000), 0.05)
      engine.onPcmFrame(pcm(16000, 0), 0)
      await new Promise(r => setTimeout(r, 10))
      // 仍然只有 1 次推送（切段返回的没推）
      expect(overlay.pushListeningPreview).toHaveBeenCalledTimes(1)
    })

    it('invoke 抛错不外抛，previewInFlight finally 释放', async () => {
      ;(invoke as any).mockRejectedValue(new Error('ASR failed'))
      for (let i = 0; i < 16; i++) engine.onPcmFrame(pcm(1000, 1000), 0.05)
      engine.onPcmFrame(pcm(16000, 0), 0)
      await new Promise(r => setTimeout(r, 10))
      // 不应推任何东西
      expect(overlay.pushListeningPreview).not.toHaveBeenCalled()

      // 第二个切段应能正常触发（in-flight 已释放）
      ;(invoke as any).mockResolvedValue({ text: 'second', elapsed_ms: 50 })
      for (let i = 0; i < 16; i++) engine.onPcmFrame(pcm(1000, 1000), 0.05)
      engine.onPcmFrame(pcm(16000, 0), 0)
      await new Promise(r => setTimeout(r, 10))
      expect(overlay.pushListeningPreview).toHaveBeenCalledWith('second', expect.any(Number))
    })
  })
})
