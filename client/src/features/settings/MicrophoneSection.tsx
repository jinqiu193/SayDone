import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import PageSection from '@/components/ui/PageSection'
import { Select } from '@/components/ui/select'
import { drawBars, resetWaveform } from '@/services/waveform'
import { cleanMicLabel } from './utils'

export type MicVolumeLevel = 'idle' | 'silent' | 'low' | 'normal'

const VOLUME_CONFIG: Record<MicVolumeLevel, { label: string; color: string; desc: string }> = {
  idle:   { label: '', color: '', desc: '' },
  silent: { label: '静音', color: 'text-destructive', desc: '未检测到声音，请检查麦克风是否被静音或被其他应用占用' },
  low:    { label: '声音偏小', color: 'text-warning', desc: '声音较小，建议靠近麦克风或调高系统音量' },
  normal: { label: '正常', color: 'text-success', desc: '麦克风工作正常' },
}

/**
 * 麦克风测试卡片。
 * 性能优化：所有内部状态（testing 之外的 volumeLevel / errorMessage / canvas ref / interval）
 * 都下沉到本组件内，避免父级 500ms 一次的 setVolumeLevel 触发整页 re-render。
 * testing 状态仍受控于父级，便于外部协调（如按钮 disable）。
 */
export default function MicrophoneSection({
  mics,
  selectedMic,
  testing,
  onMicChange,
  onTestingChange,
}: {
  mics: MediaDeviceInfo[]
  selectedMic: string
  testing: boolean
  onMicChange: (deviceId: string) => void
  /** 子组件内部 testing 状态变化时通知父级（仅用于按钮 disable 协调） */
  onTestingChange: (next: boolean) => void
}) {
  const micOptions = useMemo(() => {
    return [
      { value: '', label: '系统默认' },
      ...mics.map((mic) => ({
        value: mic.deviceId,
        label: cleanMicLabel(mic.label) || `麦克风 ${mic.deviceId.slice(0, 8)}`,
      })),
    ]
  }, [mics])

  // ── 自管状态：仅本组件 re-render ──
  const [volumeLevel, setVolumeLevel] = useState<MicVolumeLevel>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')

  // canvas / 音频 / interval 全部用 ref，避免任何 re-render
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animRef = useRef<number>(0)
  // 持有 mic test 内部资源，effect 清理时统一释放
  const resourcesRef = useRef<{
    stream?: MediaStream
    context?: AudioContext
    intervalId?: ReturnType<typeof setInterval>
    timeoutId?: ReturnType<typeof setTimeout>
  }>({})

  // 当父级把 testing 设为 true 时，启动麦克风测试
  // 当父级把 testing 设为 false 时（如 5 秒到 / 出错），清理所有资源
  useEffect(() => {
    if (testing) {
      void startMicTest()
    } else {
      stopMicTest()
    }
    return () => {
      // 卸载时强制清理
      stopMicTest()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testing, selectedMic])

  async function startMicTest() {
    setErrorMessage('')
    setVolumeLevel('idle')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedMic ? { deviceId: { exact: selectedMic } } : true,
      })
      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.7
      source.connect(analyser)
      resetWaveform()
      drawWaveformLoop(analyser)

      // 音量检测：每 500ms 采样一次，取 5 秒内的峰值 RMS 判断级别
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      let peakRms = 0
      const intervalId = setInterval(() => {
        analyser.getByteTimeDomainData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / dataArray.length)
        if (rms > peakRms) peakRms = rms
        // 实时更新级别（只 re-render 本组件，不动父级）
        if (peakRms < 0.002) setVolumeLevel('silent')
        else if (peakRms < 0.02) setVolumeLevel('low')
        else setVolumeLevel('normal')
      }, 500)

      // 5 秒后自动结束
      const timeoutId = setTimeout(() => {
        onTestingChange(false)
      }, 5000)

      resourcesRef.current = { stream, context: audioCtx, intervalId, timeoutId }
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === 'NotFoundError'
          ? '未检测到麦克风设备，请连接麦克风后重试'
          : err instanceof DOMException && err.name === 'NotAllowedError'
            ? '麦克风权限被拒绝，请在系统设置中允许访问麦克风'
            : '麦克风访问失败，请检查设备连接'
      setErrorMessage(msg)
      onTestingChange(false)
    }
  }

  function drawWaveformLoop(analyser: AnalyserNode) {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const draw = () => {
      drawBars(context, analyser, canvas.width, canvas.height)
      animRef.current = requestAnimationFrame(draw)
    }
    draw()
  }

  function stopMicTest() {
    const r = resourcesRef.current
    if (r.intervalId) clearInterval(r.intervalId)
    if (r.timeoutId) clearTimeout(r.timeoutId)
    cancelAnimationFrame(animRef.current)
    r.stream?.getTracks().forEach((t) => t.stop())
    r.context?.close().catch(() => {})
    resourcesRef.current = {}
    // 重置显示状态
    setVolumeLevel('idle')
  }

  const vol = VOLUME_CONFIG[volumeLevel]

  return (
    <PageSection title="麦克风">
      <div>
        <label className="mb-2 block text-sm text-foreground">选择麦克风</label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={selectedMic}
            onChange={onMicChange}
            options={micOptions}
            className="sm:flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => onTestingChange(true)}
            disabled={testing}
            className="h-9 shrink-0 px-4"
          >
            {testing ? '测试中...' : '测试麦克风'}
          </Button>
        </div>
      </div>

      {testing && (
        <div className="space-y-2">
          <canvas
            ref={canvasRef}
            width={160}
            height={40}
            className="mx-auto rounded-md border border-border"
            style={{ width: '160px', height: '40px' }}
          />
          {volumeLevel !== 'idle' && (
            <div className="text-center">
              <span className={`text-xs font-medium ${vol.color}`}>{vol.label}</span>
              <p className="mt-0.5 text-xs text-muted-foreground">{vol.desc}</p>
            </div>
          )}
        </div>
      )}

      {errorMessage && !testing && (
        <p className="text-xs text-destructive">{errorMessage}</p>
      )}
    </PageSection>
  )
}
