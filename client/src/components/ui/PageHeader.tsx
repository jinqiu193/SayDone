import * as React from "react"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string
  description?: React.ReactNode
  /** 右上角操作区（如"新词"按钮、搜索） */
  action?: React.ReactNode
  className?: string
}

/**
 * 统一页面标题区 — 中式排版：宋体字韵 + 宽字距 + 宽行高。
 * 标题：text-3xl font-medium tracking-[0.08em] leading-[1.5] max-w-2xl
 * 描述：mt-3 text-sm text-muted-foreground leading-[1.85] max-w-2xl
 */
export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-8 flex items-start justify-between gap-6", className)}>
      <div className="min-w-0 flex-1">
        <h1 className="max-w-2xl text-3xl font-medium tracking-[0.08em] leading-[1.5] text-foreground">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl text-sm leading-[1.85] text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  )
}