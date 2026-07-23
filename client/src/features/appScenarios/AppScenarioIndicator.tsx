/**
 * AppScenarioIndicator - 复用组件
 *
 * 渲染当前应用场景的"模式徽章"：
 * - 图标 + 中文 label + 简短 desc（可折叠）
 * - 自动/手动覆盖标签
 * - 点击 popover 可手动覆盖
 *
 * 用于 Home 顶部 + 设置页预览 + 浮窗状态栏（去掉详细 desc，简化版）
 */

import { useMemo, useState } from 'react'
import { Code2, Edit3, FileText, Mail, MessageCircle, Sparkles, Type, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  POLISH_STYLE_META,
  type PolishStyleId,
} from '@/services/recorder/helpers'

const ICONS = {
  'message-circle': MessageCircle,
  type: Type,
  mail: Mail,
  'file-text': FileText,
  'code-2': Code2,
  'edit-3': Edit3,
  sparkles: Sparkles,
} as const

interface IndicatorProps {
  style: PolishStyleId
  processName?: string | null
  /** 是否显示下拉可手动覆盖 */
  interactive?: boolean
  /** 用户已手动覆盖（非 auto 推断时）：显示 "已锁定" 徽章 */
  isOverridden?: boolean
  onChangeStyle?: (style: PolishStyleId | null) => void
  /** 紧凑模式：去掉 desc（用于浮窗） */
  compact?: boolean
  className?: string
}

export function AppScenarioIndicator({
  style,
  processName,
  interactive = false,
  isOverridden = false,
  onChangeStyle,
  compact = false,
  className,
}: IndicatorProps) {
  const meta = POLISH_STYLE_META[style]
  const Icon = ICONS[meta.icon]
  const [open, setOpen] = useState(false)

  const styles = useMemo(() => Object.values(POLISH_STYLE_META), [])

  return (
    <div className={cn('relative inline-flex items-center', className)}>
      <button
        type="button"
        onClick={interactive ? () => setOpen(v => !v) : undefined}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-1.5 text-sm shadow-soft transition-colors',
          interactive && 'hover:bg-surface-2',
          isOverridden && 'ring-1 ring-primary/40',
        )}
        title={meta.desc}
      >
        <Icon className="h-4 w-4 text-primary" />
        <span className="font-medium">{meta.label}</span>
        {!compact && (
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {processName ? `· ${processName}` : meta.desc}
          </span>
        )}
        {isOverridden && (
          <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            锁定
          </span>
        )}
        {interactive && <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {interactive && open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-border bg-surface-2 p-2 shadow-elevated"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="mb-2 px-2 text-xs text-muted-foreground">
            {processName ? `为 ${processName} 选择风格` : '为当前焦点应用选择风格'}
          </div>
          <div className="grid grid-cols-2 gap-1">
            {styles.map((s) => {
              const Si = ICONS[s.icon]
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onChangeStyle?.(s.id === 'auto' ? null : s.id)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex items-start gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors',
                    style === s.id ? 'bg-primary/10 text-primary' : 'hover:bg-surface-3',
                  )}
                >
                  <Si className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <div className="font-medium">{s.label}</div>
                    <div className="text-[11px] text-muted-foreground">{s.desc}</div>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
