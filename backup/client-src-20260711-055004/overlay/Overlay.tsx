import * as bridge from '../services/bridge'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { addRuntimeEvent } from '../services/debugLog'

type OverlayState = 'waiting' | 'listening' | 'thinking' | 'fallback' | 'error'
type OverlayWaveTheme = 'black-white' | 'black-blue' | 'black-rainbow'

const DEFAULT_BAR_COUNT = 24

const TIMER_COLOR_CACHE = new Map<string, string>()
function getTimerColor(theme: OverlayWaveTheme): string {
  let cached = TIMER_COLOR_CACHE.get(theme)
  if (cached !== undefined) return cached
  const color = theme === 'black-white' ? '#e5e7eb'
    : theme === 'black-rainbow' ? '#fef08a'
    : '#bae6fd'
  TIMER_COLOR_CACHE.set(theme, color)
  return color
}

const THINK_COLOR_CACHE = new Map<string, string>()
function getThinkingColor(theme: OverlayWaveTheme): string {
  let cached = THINK_COLOR_CACHE.get(theme)
  if (cached !== undefined) return cached
  const color = theme === 'black-white' ? '#e2e8f0'
    : theme === 'black-rainbow' ? '#facc15'
    : '#38bdf8'
  THINK_COLOR_CACHE.set(theme, color)
  return color
}

const BAR_COLORS_CACHE = new Map<string, Map<number, string>>()
function getListeningBarColor(index: number, total: number, theme: OverlayWaveTheme): string {
  let themeMap = BAR_COLORS_CACHE.get(theme)
  if (!themeMap) {
    themeMap = new Map()
    BAR_COLORS_CACHE.set(theme, themeMap)
  }
  let cached = themeMap.get(index)
  if (cached !== undefined) return cached

  const safeTotal = Math.max(1, total - 1)
  const t = index / safeTotal
  let color: string

  if (theme === 'black-white') {
    color = '#f1f5f9'
  } else if (theme === 'black-rainbow') {
    const hue = 140 - Math.round(t * 110)
    const lightness = 64 - Math.round(Math.abs(t - 0.5) * 12)
    color = `hsl(${hue} 95% ${lightness}%)`
  } else {
    const hue = 190 + Math.round(t * 30)
    const lightness = 62 - Math.round(Math.abs(t - 0.5) * 14)
    color = `hsl(${hue} 90% ${lightness}%)`
  }

  if (BAR_COLORS_CACHE.size < 10) {
    themeMap.set(index, color)
  }
  return color
}

interface BarProps {
  index: number
  height: number
  total: number
  theme: OverlayWaveTheme
}

const Bar = React.memo(function Bar({ index, height, total, theme }: BarProps) {
  const color = getListeningBarColor(index, total, theme)
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

export default function Overlay() {
  const [state, setState] = useState<OverlayState>('waiting')
  const [bars, setBars] = useState<number[]>(Array(DEFAULT_BAR_COUNT).fill(3))
  const [elapsedSec, setElapsedSec] = useState(0)
  const [theme, setTheme] = useState<OverlayWaveTheme>('black-blue')
  const [showDuration, setShowDuration] = useState(true)
  const [barCount, setBarCount] = useState(DEFAULT_BAR_COUNT)
  const [fallbackText, setFallbackText] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [thinkingDuration, setThinkingDuration] = useState(0)
  const [warning, setWarning] = useState('')
  const [thinkingMessage, setThinkingMessage] = useState('处理中')

  const [entryKey, setEntryKey] = useState(0)
  const [copied, setCopied] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevStateRef = useRef<OverlayState>('waiting')

  const thinkingColor = getThinkingColor(theme)
  const timerColor = getTimerColor(theme)

  const barElements = useMemo(() => (
    <div className="flex items-center gap-[2px]" style={{ height: '20px' }}>
      {bars.map((height, index) => (
        <Bar key={index} index={index} height={height} total={bars.length} theme={theme} />
      ))}
    </div>
  ), [bars, theme])

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

      if (payload.theme !== undefined) {
        const t = payload.theme as string
        if (t === 'black-white' || t === 'black-blue' || t === 'black-rainbow') {
          setTheme(t)
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
        setWarning(payload.warning as string)
      }

      if (payload.thinkingMessage !== undefined) {
        setThinkingMessage(payload.thinkingMessage as string)
      } else {
        setThinkingMessage('处理中')
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
          style={{ background: 'var(--overlay-bg)', color: 'var(--overlay-text)', borderColor: 'var(--overlay-border)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <span className="block text-xs font-medium tracking-[0.16em]" style={{ color: 'var(--overlay-text-muted)' }}>识别文本</span>
              <span className="block text-xs" style={{ color: 'var(--overlay-text-dim)' }}>
                当前目标不支持直接写入，文本已经复制到剪贴板。
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyFallback}
              title={copied ? '已复制' : '复制文本'}
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                copied ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200' : 'border-white/10 bg-white/10 text-white/90 hover:bg-white/20'
              }`}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-4 flex-1 overflow-hidden rounded-lg px-3 py-3" style={{ background: 'var(--overlay-surface)' }}>
            <p className="max-h-[108px] overflow-auto pr-1 text-sm leading-6 select-text">
              {fallbackText || '（无文本）'}
            </p>
          </div>
        </div>
      ) : (
        <div
          key={`main-${entryKey}`}
          className="flex items-center rounded-full border px-4 py-2 shadow-[0_6px_16px_rgba(0,0,0,0.35)] animate-overlay-pop-in"
          style={{ background: 'var(--overlay-bg)', color: 'var(--overlay-text)', borderColor: 'var(--overlay-border)' }}
        >
          {state === 'waiting' && (
            <div className="flex items-center gap-[2px]" style={{ height: '20px' }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-[2.5px] rounded-full"
                  style={{
                    backgroundColor: 'var(--overlay-text-dim)',
                    height: '12px',
                    opacity: 0.7,
                    animation: `dot-pulse 1s ease-in-out ${i * 0.15}s infinite`,
                  }}
                />
              ))}
            </div>
          )}

          {state === 'listening' && (
            <>
              {barElements}
              {showDuration && (
                <span className="ml-1.5 min-w-[24px] text-right font-mono tabular-nums text-xs" style={{ color: timerColor }}>
                  {Math.floor(elapsedSec)}s
                </span>
              )}
              {warning && (
                <span className="ml-2 text-xs text-amber-400 animate-pulse">{warning}</span>
              )}
            </>
          )}

          {state === 'thinking' && (
            <div className="flex items-center gap-2">
              <div className="relative h-1 w-12 overflow-hidden rounded-full bg-white/10">
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
              <span className="text-xs whitespace-nowrap" style={{ color: thinkingColor }}>{thinkingMessage}</span>
            </div>
          )}

          {state === 'error' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-400">{errorMessage || '出错了'}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
