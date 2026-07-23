import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * 统一页面容器 — 全应用页面都用这个包一层。
 * max-w-5xl mx-auto px-8 py-10：宽松布局（Typeless 风格）。
 *
 * 不直接 div，给后续切高度自适应、滚动隔离留扩展空间。
 */
export const Page = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("mx-auto w-full max-w-5xl px-8 py-10", className)}
      {...props}
    />
  )
)
Page.displayName = "Page"