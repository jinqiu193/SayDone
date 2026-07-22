// 外观设置页面 — 主题 + 悬浮窗样式 + 预览

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { themeList } from '@/themes'
import { switchTheme, getActiveThemeId } from '@/stores/theme'
import { getSetting, setSetting } from '@/services/store'
import { refreshOverlaySettings, refreshRecorderSettings } from '@/services/recorder'
import { OVERLAY_WIDTH_PRESETS, type OverlayWidthPreset } from '@/services/recorder/types'
import * as bridge from '@/services/bridge'

const WIDTH_OPTIONS: Array<{ value: OverlayWidthPreset; label: string }> = [
  { value: 'short', label: '短' },
  { value: 'medium', label: '中' },
  { value: 'long', label: '长' },
]

const POSITION_OPTIONS: Array<{ value: 'bottom' | 'top'; label: string; desc: string }> = [
  { value: 'bottom', label: '底部', desc: '屏幕下方居中' },
  { value: 'top', label: '顶部', desc: '屏幕上方居中' },
]

/** 从当前主题 --overlay-accent 派生波形条颜色（在 accent hue 上下偏移） */
function getBarColor(index: number, total: number): string {
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

/** 计时器颜色：直接用主题 accent */
function getTimerColor(): string {
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--overlay-accent').trim()
  if (!accent) return '#ffffff'
  return `hsl(${accent})`
}

function OverlayPreview({ showDuration, barCount }: { showDuration: boolean; barCount: number }) {
  const barRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    const heights = new Array(barCount).fill(3)
    let running = true
    let rafId = 0
    let lastFrame = 0
    const FRAME_INTERVAL = 1000 / 30 // 30fps 足够流畅，且不占满主线程

    const animate = (now: number) => {
      if (!running) return
      if (now - lastFrame >= FRAME_INTERVAL) {
        lastFrame = now
        for (let i = 0; i < heights.length; i++) {
          const target = 3 + Math.random() * 15
          heights[i] = heights[i] + (target - heights[i]) * 0.15
          const el = barRefs.current[i]
          if (el) {
            const h = Math.min(18, Math.max(3, heights[i]))
            el.style.height = `${h}px`
            el.style.opacity = String(0.7 + (h / 18) * 0.3)
          }
        }
      }
      rafId = requestAnimationFrame(animate)
    }
    rafId = requestAnimationFrame(animate)
    return () => {
      running = false
      cancelAnimationFrame(rafId)
    }
  }, [barCount])

  return (
    <div className="flex flex-col items-center gap-3">
      {/* 1:1 还原真实悬浮窗样式 */}
      <div
        className="flex items-center rounded-full border px-4 py-2 shadow-[0_6px_16px_rgba(0,0,0,0.35)]"
        style={{
          background: 'hsl(var(--overlay-bg))',
          borderColor: 'hsl(var(--overlay-border) / 0.25)',
          boxShadow: '0 6px 20px hsl(var(--overlay-bg) / 0.5), 0 0 0 1px hsl(var(--overlay-accent) / 0.18)',
        }}
      >
        <div className="flex items-center gap-[2px]" style={{ height: '20px' }}>
          {Array.from({ length: barCount }, (_, index) => {
            const color = getBarColor(index, barCount)
            return (
              <div
                key={index}
                ref={(el) => { barRefs.current[index] = el }}
                className="w-[2.5px] rounded-full"
                style={{
                  backgroundColor: color,
                  height: '3px',
                  opacity: 0.7,
                  transition: 'height 50ms ease-out, opacity 50ms ease-out',
                }}
              />
            )
          })}
        </div>
        {showDuration && (
          <span
            className="ml-1.5 min-w-[24px] text-right font-mono tabular-nums text-xs"
            style={{ color: getTimerColor() }}
          >
            3.2s
          </span>
        )}
      </div>
      <span className="text-xs text-muted-foreground">悬浮窗预览</span>
    </div>
  )
}

export default function AppearancePage() {
  const [activeTheme, setActiveTheme] = useState(getActiveThemeId)
  const [overlayShowDuration, setOverlayShowDuration] = useState(true)
  const [overlayWidth, setOverlayWidth] = useState<OverlayWidthPreset>('medium')
  const [overlayPosition, setOverlayPosition] = useState<'bottom' | 'top'>('bottom')
  const [enablePreviewPartial, setEnablePreviewPartial] = useState(true)

  useEffect(() => {
    getSetting('overlayShowDuration', true).then((value) => setOverlayShowDuration(Boolean(value)))
    getSetting('overlayWidth', 'medium').then((value) => {
      const v = value as OverlayWidthPreset
      if (v === 'short' || v === 'medium' || v === 'long') setOverlayWidth(v)
    })
    getSetting<'bottom' | 'top'>('overlayPosition', 'bottom').then((value) => {
      if (value === 'bottom' || value === 'top') setOverlayPosition(value)
    })
    getSetting('enablePreviewPartial', true).then((value) => setEnablePreviewPartial(value !== false))
  }, [])

  const handleThemeChange = async (themeId: string) => {
    await switchTheme(themeId)
    setActiveTheme(themeId)
    // 通知所有 webview（包括浮窗）立即跟随主题
    await bridge.notifyThemeChanged(themeId)
  }

  const handleTogglePreviewPartial = async () => {
    const next = !enablePreviewPartial
    setEnablePreviewPartial(next)
    await setSetting('enablePreviewPartial', next)
    // 让 RecorderOrchestrator 重新加载设置（previewEnabled 在 refreshRuntimeSettings 里读取）
    void refreshRecorderSettings()
  }

  const handleToggleDuration = async () => {
    const next = !overlayShowDuration
    setOverlayShowDuration(next)
    await setSetting('overlayShowDuration', next)
    await refreshOverlaySettings()
  }

  const handleOverlayWidthChange = async (preset: OverlayWidthPreset) => {
    setOverlayWidth(preset)
    await setSetting('overlayWidth', preset)
    await refreshOverlaySettings()
  }

  const handleOverlayPositionChange = async (pos: 'bottom' | 'top') => {
    setOverlayPosition(pos)
    await setSetting('overlayPosition', pos)
    await refreshOverlaySettings()
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-bold">外观</h1>

      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 text-lg font-semibold">应用主题</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {themeList.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => void handleThemeChange(theme.id)}
                  className={`group flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200 ${
                    activeTheme === theme.id
                      ? 'border-primary/50 bg-primary/10 shadow-[var(--highlight-glow)]'
                      : 'border-border bg-surface-2/60 hover:bg-surface-2 hover:border-primary/30'
                  }`}
                >
                  <div
                    className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border/40 shadow-soft"
                    style={{
                      background: `linear-gradient(135deg, ${theme.previewColors.bg}, ${theme.previewColors.primary})`,
                    }}
                  >
                    <span
                      className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border border-white/30"
                      style={{ background: theme.previewColors.accent }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{theme.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {theme.isDark ? '深色 · ' : '浅色 · '}
                      {theme.fonts?.body?.includes('Serif') ? '衬线' : '无衬线'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="mb-2 text-lg font-semibold">悬浮窗样式</h2>
            <p className="mb-4 text-xs text-muted-foreground">悬浮窗颜色自动跟随主主题设置，无需单独选择。</p>

            <div className="space-y-4">
              <div>
                <div>
                  <p className="mb-2 text-sm text-muted-foreground">悬浮窗长度</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {WIDTH_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => void handleOverlayWidthChange(option.value)}
                        className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                          overlayWidth === option.value
                            ? 'bg-primary/10 ring-2 ring-primary/40'
                            : 'bg-secondary/40 hover:bg-accent'
                        }`}
                      >
                        <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full ${overlayWidth === option.value ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                          {overlayWidth === option.value && <span className="h-2 w-2 rounded-full bg-primary" />}
                        </span>
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">显示按住时长</p>
                    <p className="text-xs text-muted-foreground">关闭后仅显示波形</p>
                  </div>
                  <Switch checked={overlayShowDuration} onChange={handleToggleDuration} />
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">实时识别预览</p>
                    <p className="text-xs text-muted-foreground">停顿 1 秒后实时显示当前已识别文本（覆盖波形条）。本地模式效果最佳。</p>
                  </div>
                  <Switch checked={enablePreviewPartial} onChange={handleTogglePreviewPartial} />
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-sm text-muted-foreground">屏幕位置</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {POSITION_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => void handleOverlayPositionChange(option.value)}
                        className={`flex flex-col items-start gap-0.5 rounded-md px-3 py-2 text-sm transition-colors ${
                          overlayPosition === option.value
                            ? 'bg-primary/10 ring-2 ring-primary/40'
                            : 'bg-secondary/40 hover:bg-accent'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full ${overlayPosition === option.value ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                            {overlayPosition === option.value && <span className="h-2 w-2 rounded-full bg-primary" />}
                          </span>
                          <span className="font-medium">{option.label}</span>
                        </span>
                        <span className="ml-5 text-xs text-muted-foreground">{option.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex justify-center">
                  <OverlayPreview showDuration={overlayShowDuration} barCount={OVERLAY_WIDTH_PRESETS[overlayWidth].barCount} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
