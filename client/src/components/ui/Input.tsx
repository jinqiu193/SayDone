import * as React from "react"
import { cn } from "@/lib/utils"

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** 左侧 icon（典型用法：Search） */
  leftIcon?: React.ComponentType<{ className?: string }>
  /** 右侧 icon / chip */
  rightAdornment?: React.ReactNode
  /** 错误状态（红色边框） */
  error?: boolean
}

/**
 * 统一输入框 — 解决 KB / History / Dictionary 风格分裂。
 * 默认：bg-secondary/60 h-9 px-3 text-sm
 * focus：ring-2 ring-cta/30
 *
 * 用法：
 *   <Input value={...} onChange={...} placeholder="搜索热词" leftIcon={Search} />
 *   <Input value={...} onChange={...} placeholder="新分类名" />
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, leftIcon: LeftIcon, rightAdornment, error, type = "text", ...props }, ref) => {
    return (
      <div className={cn("relative flex w-full items-center", className)}>
        {LeftIcon && (
          <LeftIcon className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
        )}
        <input
          ref={ref}
          type={type}
          className={cn(
            "w-full rounded-md bg-secondary/60 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-input-placeholder",
            "focus:bg-secondary focus:ring-2 focus:ring-cta/30",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error
              ? "ring-2 ring-destructive/30"
              : "",
            LeftIcon ? "pl-8 pr-3" : "px-3",
            rightAdornment ? "pr-10" : "",
          )}
          {...props}
        />
        {rightAdornment && (
          <div className="absolute right-2 flex items-center">{rightAdornment}</div>
        )}
      </div>
    )
  },
)
Input.displayName = "Input"