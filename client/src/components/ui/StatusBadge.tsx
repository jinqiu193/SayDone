import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * 状态徽章 — 统一替代 8+ 处不同的徽章写法（success / warning / error / info / primary / neutral）。
 * 全部走主题 token，未来调色一处生效。
 *
 * 典型用法：
 *   <StatusBadge tone="success" dot>已连接</StatusBadge>
 *   <StatusBadge tone="warning" dot>连接中</StatusBadge>
 *   <StatusBadge tone="error">连接失败</StatusBadge>
 *   <StatusBadge tone="primary">本地</StatusBadge>
 */
export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral'

const TONE_BG: Record<StatusTone, string> = {
  success: 'bg-[linear-gradient(135deg,hsl(var(--success)/0.14),hsl(var(--success)/0.06))] text-success',
  warning: 'bg-[linear-gradient(135deg,hsl(var(--warning)/0.14),hsl(var(--warning)/0.06))] text-warning',
  error: 'bg-[linear-gradient(135deg,hsl(var(--destructive)/0.14),hsl(var(--destructive)/0.06))] text-destructive',
  info: 'bg-[linear-gradient(135deg,hsl(var(--info)/0.14),hsl(var(--info)/0.06))] text-info',
  primary: 'bg-[linear-gradient(135deg,hsl(var(--primary)/0.14),hsl(var(--primary)/0.06))] text-primary',
  neutral: 'bg-muted text-muted-foreground',
}

const TONE_DOT: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-destructive',
  info: 'bg-info',
  primary: 'bg-primary',
  neutral: 'bg-muted-foreground',
}

const TONE_GLOW: Record<StatusTone, string> = {
  success: 'shadow-[0_0_0_2px_hsl(var(--status-success-glow))]',
  warning: 'shadow-[0_0_0_2px_hsl(var(--status-warning-glow))]',
  error: 'shadow-[0_0_0_2px_hsl(var(--status-error-glow))]',
  info: 'shadow-[0_0_0_2px_hsl(var(--status-info-glow))]',
  primary: 'shadow-[0_0_0_2px_hsl(var(--status-success-glow))]',
  neutral: '',
}

interface StatusBadgeProps {
  tone?: StatusTone
  /** 是否显示左侧圆点（用于"连接状态"等场景） */
  dot?: boolean
  /** 圆点额外 class（如 animate-pulse） */
  dotClassName?: string
  /** 是否在 dot 模式额外加光晕 box-shadow（视觉强调，谨慎使用） */
  glow?: boolean
  children: React.ReactNode
  className?: string
}

const StatusBadge: React.FC<StatusBadgeProps> = ({
  tone = 'neutral',
  dot = false,
  dotClassName,
  glow = false,
  children,
  className,
}) => {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        TONE_BG[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cn(
            'inline-block h-1.5 w-1.5 rounded-full',
            TONE_DOT[tone],
            glow && TONE_GLOW[tone],
            dotClassName,
          )}
        />
      )}
      {children}
    </span>
  )
}

export default StatusBadge