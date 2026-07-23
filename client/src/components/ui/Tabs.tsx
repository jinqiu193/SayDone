import * as React from "react"
import { cn } from "@/lib/utils"

export interface TabItem<T extends string = string> {
  value: T
  label: React.ReactNode
  /** 可选：左侧图标 */
  icon?: React.ReactNode
  /** 可选：右侧装饰（如计数 chip） */
  rightAdornment?: React.ReactNode
  disabled?: boolean
}

interface TabsProps<T extends string = string> {
  value: T
  onChange: (value: T) => void
  items: TabItem<T>[]
  className?: string
  ariaLabel?: string
}

/**
 * 胶囊式 Tab — 抽取自 History / Dictionary 共用样式。
 * 容器：inline-flex gap-1 rounded-lg bg-secondary/60 p-0.5
 * 按钮：rounded-md px-3 py-1 text-xs
 *
 * 视觉特征（Typeless 风格）：
 * - 激活态：bg-accent + font-medium + text-foreground
 * - 非激活：text-muted-foreground + hover:text-foreground
 */
export function Tabs<T extends string = string>({
  value,
  onChange,
  items,
  className,
  ariaLabel,
}: TabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex gap-1 rounded-lg bg-secondary/60 p-0.5",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs transition-colors disabled:opacity-50 disabled:pointer-events-none",
              active
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.rightAdornment}
          </button>
        )
      })}
    </div>
  )
}