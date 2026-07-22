import * as React from "react"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  title: string
  description?: string
  icon?: React.ReactNode
  /** 'classic' = 仅 icon（默认）；'ink' = 墨点占位 + icon */
  variant?: 'classic' | 'ink'
  action?: React.ReactNode
  className?: string
}

/**
 * 水墨占位 — 1 个不规则主墨点 + 3 个散落小墨点。
 * 颜色取 currentColor（继承 muted-foreground），opacity 0.35。
 */
function InkSplash() {
  return (
    <svg
      width="120"
      height="96"
      viewBox="0 0 120 96"
      fill="currentColor"
      className="text-muted-foreground"
      aria-hidden="true"
    >
      {/* 主墨点 — 贝塞尔曲线画的不规则形状 */}
      <path
        d="M 60 48
           C 70 30, 88 32, 84 50
           C 80 68, 60 72, 50 64
           C 38 58, 36 44, 46 38
           C 52 34, 56 38, 60 48 Z"
        opacity="0.35"
      />
      {/* 小墨点 1（左上） */}
      <circle cx="22" cy="22" r="3" opacity="0.25" />
      {/* 小墨点 2（右下） */}
      <circle cx="98" cy="78" r="4" opacity="0.22" />
      {/* 小墨点 3（中右） */}
      <ellipse cx="106" cy="38" rx="2" ry="3" opacity="0.20" />
      {/* 小墨点 4（左下） */}
      <circle cx="16" cy="74" r="2" opacity="0.18" />
    </svg>
  )
}

/**
 * 统一空状态 — Typeless 风格极简居中样式。
 * py-16 留白 + 标题 + 单行说明，**不加边框/卡片**（与原"虚线框"区分）。
 *
 * 用法：
 *   <EmptyState title="还没有词汇" description="SayDone 会自动学习您的编辑历史" />
 *   <EmptyState variant="ink" title="尚无内容" />
 */
export function EmptyState({
  title,
  description,
  icon,
  variant = 'classic',
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 text-center", className)}>
      {variant === 'ink' && (
        <div className="mb-2">
          <InkSplash />
        </div>
      )}
      {icon && <div className="mb-3 text-muted-foreground">{icon}</div>}
      <p className="text-base font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}