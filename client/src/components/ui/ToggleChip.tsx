import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * 单选 chip 按钮 — 用于"保留天数 / 语言 / 下载源"等少量选项的选择。
 * 替代设置页内 7+ 处 `rounded-md px-3 py-1.5 text-sm transition-colors ... bg-cta/bg-secondary/60` 重复样板。
 *
 * 两种视觉风格：
 * - `variant="standalone"`（默认）：独立 chip，selected = 宝蓝实色
 * - `variant="pill"`：放在 bg-secondary/40 容器里的胶囊 tab（用于 UserStatsSection 时间范围）
 *
 * 典型用法：
 *   {OPTIONS.map(o => (
 *     <ToggleChip key={o.value} selected={value === o.value} onClick={() => setValue(o.value)}>
 *       {o.label}
 *     </ToggleChip>
 *   ))}
 */
export type ToggleChipVariant = 'standalone' | 'pill'
export type ToggleChipSize = 'sm' | 'md'

interface ToggleChipProps {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
  variant?: ToggleChipVariant
  size?: ToggleChipSize
  disabled?: boolean
  className?: string
}

const SIZE_CLASS: Record<ToggleChipSize, string> = {
  sm: 'px-3 py-1 text-xs',
  md: 'px-4 py-1.5 text-sm',
}

const VARIANT_CLASS = {
  standalone: {
    selected: 'bg-cta text-cta-foreground',
    unselected: 'bg-secondary/60 text-foreground hover:bg-accent',
  },
  pill: {
    selected: 'bg-accent text-foreground font-medium',
    unselected: 'text-muted-foreground hover:text-foreground',
  },
} as const

const ToggleChip: React.FC<ToggleChipProps> = ({
  selected,
  onClick,
  children,
  variant = 'standalone',
  size = 'md',
  disabled = false,
  className,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        SIZE_CLASS[size],
        selected ? VARIANT_CLASS[variant].selected : VARIANT_CLASS[variant].unselected,
        className,
      )}
    >
      {children}
    </button>
  )
}

export default ToggleChip