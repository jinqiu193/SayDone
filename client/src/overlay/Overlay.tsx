import * as bridge from '../services/bridge'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { addRuntimeEvent } from '../services/debugLog'

type OverlayState = 'waiting' | 'listening' | 'thinking' | 'fallback' | 'error'

const DEFAULT_BAR_COUNT = 24

/** 从主题 --overlay-accent 派生波形条颜色（在 accent hue 上下偏移） */
function getBarColor(index: number, total: number): string {
  if (typeof document === 'undefined') return '#ffffff'
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--overlay-accent').trim()
  if (!accent) return '#ffffff'
  const m = accent.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/)
  if (!m) return '#ffffff'
  const baseHue = Number(m[1])
  const sat = Number(m[2])
  const t = index / Math.max(1, total - 1)
  const hue = baseHue + Math.round(t * 30) - 15
  const lightness = 64 - Math.round(Math.abs(t - 0.5) * 12)
  return `hsl(${hue} ${sat}% ${lightness}%)`
}

/** 计时器颜色 / 思考条颜色：直接用主题 accent */
function getAccentColor(): string {
  if (typeof document === 'undefined') return '#ffffff'
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--overlay-accent').trim()
  if (!accent) return '#ffffff'
  return `hsl(${accent})`
}

interface BarProps {
  index: number
  height: number
  total: number
}

const Bar = React.memo(function Bar({ index, height, total }: BarProps) {
  const color = getBarColor(index, total)
  const displayHeight = Math.min(18, Math.max(3, height))
  const opacity = 0.7 + (displayHeight / 18) * 0.3
  return (
    <div
      className="w-[2.5px] rounded-full"
      style={{
        backgroundColor: color,
        height: `${displayHeight}px`,
        opacity,
        transition: 'height 50ms ease-out, opacity 50ms ease-out',
      }}
    />
  )
})

/** 选区操作小标签：在 waiting / listening / thinking 状态下显示"已选 X 字"。
 *  放在胶囊（rounded-full）里看起来像一个小药丸，与胶囊融为一体不破坏圆角。 */
function SelectionBadge({ chars, controlType }: { chars: number; controlType: string }) {
  return (
    <span
      className="ml-2 inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none"
      style={{
        color: 'hsl(var(--overlay-accent))',
        backgroundColor: 'hsl(var(--overlay-accent) / 0.12)',
        border: '1px solid hsl(var(--overlay-accent) / 0.3)',
      }}
      title={controlType ? `控件类型: ${controlType}` : '选区操作'}
    >
      已选 {chars} 字
    </span>
  )
}

export default function Overlay() {
  const [state, setState] = useState<OverlayState>('waiting')
  const [bars, setBars] = useState<number[]>(Array(DEFAULT_BAR_COUNT).fill(3))
  const [elapsedSec, setElapsedSec] = useState(0)
  const [showDuration, setShowDuration] = useState(true)
  const [barCount, setBarCount] = useState(DEFAULT_BAR_COUNT)
  const [fallbackText, setFallbackText] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [thinkingDuration, setThinkingDuration] = useState(0)
  const [warning, setWarning] = useState('')
  /** 短暂警告（如低音量）3 秒自动消失，避免一直挂在浮窗上 */
  const warningAutoClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [thinkingMessage, setThinkingMessage] = useState('处理中')
  /** 选区操作指示：浮窗显示"已选 X 字"标签。0 / undefined = 不显示。 */
  const [selectionChars, setSelectionChars] = useState(0)
  const [selectionControlType, setSelectionControlType] = useState('')

  const [entryKey, setEntryKey] = useState(0)
  const [copied, setCopied] = useState(false)
  const [previewText, setPreviewText] = useState('')
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevStateRef = useRef<OverlayState>('waiting')

  const accentColor = useMemo(() => getAccentColor(), [])
  const thinkingColor = accentColor
  const timerColor = accentColor

  const barElements = useMemo(() => (
    <div className="flex items-center gap-[2px]" style={{ height: '20px' }}>
      {bars.map((height, index) => (
        <Bar key={index} index={index} height={height} total={bars.length} />
      ))}
    </div>
  ), [bars])

  useEffect(() => {
    bridge.onOverlayState((data: unknown) => {
      const payload = data as Record<string, unknown>
      const s = (payload.state as OverlayState) ?? prevStateRef.current
      const prev = prevStateRef.current
      prevStateRef.current = s

      setState(s)

      if (Array.isArray(payload.bars) && payload.bars.length > 0) {
        setBars(payload.bars as number[])
      } else if (s !== 'listening') {
        setBars(Array(DEFAULT_BAR_COUNT).fill(3))
      }

      if (payload.elapsedSec !== undefined) {
        setElapsedSec(payload.elapsedSec as number)
        if (s === 'thinking') {
          const sec = payload.elapsedSec as number
          if (sec <= 5) setThinkingDuration(2)
          else if (sec <= 15) setThinkingDuration(3)
          else if (sec <= 30) setThinkingDuration(4)
          else if (sec <= 60) setThinkingDuration(5)
          else if (sec <= 120) setThinkingDuration(7)
          else if (sec <= 180) setThinkingDuration(9)
          else if (sec <= 240) setThinkingDuration(11)
          else setThinkingDuration(13)
        }
      }

      if (payload.showDuration !== undefined) {
        setShowDuration(payload.showDuration as boolean)
      }

      if (payload.barCount !== undefined) {
        setBarCount(payload.barCount as number)
      }

      if (payload.fallbackText !== undefined) {
        setFallbackText(payload.fallbackText as string)
      }

      if (payload.errorMessage !== undefined) {
        setErrorMessage(payload.errorMessage as string)
      }

      if (payload.warning !== undefined) {
        const w = payload.warning as string
        setWarning(w)
        // 短暂警告 3 秒后自动清空（避免一直挂在浮窗上）
        if (warningAutoClearTimerRef.current) {
          clearTimeout(warningAutoClearTimerRef.current)
          warningAutoClearTimerRef.current = null
        }
        if (w) {
          warningAutoClearTimerRef.current = setTimeout(() => {
            setWarning('')
            warningAutoClearTimerRef.current = null
          }, 3000)
        }
      }

      if (payload.thinkingMessage !== undefined) {
        setThinkingMessage(payload.thinkingMessage as string)
      } else {
        setThinkingMessage('处理中')
      }

      // 选区操作指示（非 undefined 才覆盖，避免空 payload 把已有指示清掉）
      if (payload.selectionChars !== undefined) {
        setSelectionChars((payload.selectionChars as number) ?? 0)
      } else if (s !== prev) {
        // 状态切换但没带 selectionChars → 不动（避免状态切换时清掉指示）
      }
      if (payload.selectionControlType !== undefined) {
        setSelectionControlType((payload.selectionControlType as string) ?? '')
      }

      // 流式 ASR 预览（替换 bars）
      if (payload.previewText !== undefined) {
        setPreviewText((payload.previewText as string) ?? '')
      }


    })

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (state === 'waiting') {
      setEntryKey((k) => k + 1)
    }
    if (state !== 'fallback') {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    }
    setCopied(false)
    // 离开 listening 时清空预览文本（松手进入 thinking 后浮窗回到处理状态）
    if (state !== 'listening') {
      setPreviewText('')
    }
  }, [state])

  const handleCopyFallback = useCallback(async () => {
    if (!fallbackText) return
    try {
      await bridge.copyText(fallbackText)
      setCopied(true)
      addRuntimeEvent('info', 'overlay', '兜底卡片复制成功', { textLen: fallbackText.length })
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(() => {
        bridge.hideOverlay()
        hideTimerRef.current = null
      }, 1400)
    } catch (error) {
      addRuntimeEvent('error', 'overlay', '兜底卡片复制失败', { error: String(error) })
    }
  }, [fallbackText])

  return (
    <div className="pointer-events-none flex h-full items-end justify-center pb-4">
      {state === 'fallback' ? (
        <div
          key={`fallback-${entryKey}`}
          className="pointer-events-auto flex w-full max-w-[520px] flex-col rounded-xl border px-4 py-4 shadow-[0_8px_20px_rgba(0,0,0,0.25)] animate-overlay-pop-in"
          style={{
            background: 'hsl(var(--overlay-bg))',
            color: 'hsl(var(--overlay-text))',
            borderColor: 'hsl(var(--overlay-border))',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <span className="block text-xs font-medium tracking-[0.16em]" style={{ color: 'hsl(var(--overlay-text-muted))' }}>识别文本</span>
              <span className="block text-xs" style={{ color: 'hsl(var(--overlay-text-dim))' }}>
                当前目标不支持直接写入，文本已经复制到剪贴板。
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyFallback}
              title={copied ? '已复制' : '复制文本'}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors"
              style={{
                borderColor: copied ? 'hsl(142 70% 45% / 0.5)' : 'hsl(var(--overlay-border) / 0.4)',
                backgroundColor: copied ? 'hsl(142 70% 45% / 0.15)' : 'hsl(var(--overlay-surface) / 0.6)',
                color: copied ? 'hsl(142 70% 35%)' : 'hsl(var(--overlay-text))',
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-4 flex-1 overflow-hidden rounded-lg px-3 py-3" style={{ background: 'hsl(var(--overlay-surface))' }}>
            <p className="max-h-[108px] overflow-auto pr-1 text-sm leading-6 select-text">
              {fallbackText || '（无文本）'}
            </p>
          </div>
        </div>
      ) : (
        <div
          key={`main-${entryKey}`}
          className="flex min-w-0 max-w-[300px] items-center overflow-hidden rounded-full border px-4 py-2 shadow-[0_6px_16px_rgba(0,0,0,0.35)] animate-overlay-pop-in"
          style={{
            background: 'hsl(var(--overlay-bg))',
            color: 'hsl(var(--overlay-text))',
            borderColor: 'hsl(var(--overlay-border) / 0.25)',
            boxShadow: '0 6px 20px hsl(var(--overlay-bg) / 0.5), 0 0 0 1px hsl(var(--overlay-accent) / 0.18)',
          }}
        >
          {state === 'waiting' && (
            <>
              <div className="flex items-center gap-[2px]" style={{ height: '20px' }}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-[2.5px] rounded-full"
                    style={{
                      backgroundColor: 'hsl(var(--overlay-text-dim))',
                      height: '12px',
                      opacity: 0.7,
                      animation: `dot-pulse 1s ease-in-out ${i * 0.15}s infinite`,
                    }}
                  />
                ))}
              </div>
              {selectionChars > 0 && (
                <SelectionBadge chars={selectionChars} controlType={selectionControlType} />
              )}
            </>
          )}

          {state === 'listening' && (
            <>
              {previewText ? (
                <span
                  key={`preview-${entryKey}`}
                  className="block min-w-0 max-w-[200px] truncate text-xs leading-5 animate-overlay-pop-in"
                  style={{ color: timerColor }}
                  title={previewText}
                >
                  {previewText}
                </span>
              ) : (
                barElements
              )}
              {showDuration && (
                <span className="ml-1.5 min-w-[24px] text-right font-mono tabular-nums text-xs" style={{ color: timerColor }}>
                  {Math.floor(elapsedSec)}s
                </span>
              )}
              {warning && (
                <span
                  className="ml-2 shrink-0 whitespace-nowrap text-xs"
                  style={{ color: 'hsl(32 90% 45%)' }}
                  title="麦克风长时间没有声音，请靠近或检查音量"
                >
                  ⚠ {warning}
                </span>
              )}
              {/* 选区操作指示（listening 状态） */}
              {selectionChars > 0 && (
                <SelectionBadge chars={selectionChars} controlType={selectionControlType} />
              )}
            </>
          )}

          {state === 'thinking' && (
            <>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div
                  className="relative h-1 w-12 overflow-hidden rounded-full"
                  style={{ backgroundColor: 'hsl(var(--overlay-surface) / 0.5)' }}
                >
                  <div
                    className="absolute left-0 top-0 h-full rounded-full"
                    style={{
                      backgroundColor: thinkingColor,
                      width: '100%',
                      transformOrigin: 'left',
                      animation: `progress-fill ${thinkingDuration}s cubic-bezier(0.4, 0, 0.2, 1) forwards`,
                    }}
                  />
                </div>
                <span className="block min-w-0 max-w-[180px] truncate text-xs leading-5" style={{ color: thinkingColor }} title={thinkingMessage}>{thinkingMessage}</span>
              </div>
              {selectionChars > 0 && (
                <SelectionBadge chars={selectionChars} controlType={selectionControlType} />
              )}
            </>
          )}

          {state === 'error' && (
            <div className="flex items-center gap-2">
              <span
                className="text-xs"
                style={{ color: 'hsl(0 75% 50%)' }}
              >
                {errorMessage || '出错了'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
