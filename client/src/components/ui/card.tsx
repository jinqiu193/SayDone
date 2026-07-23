import * as React from "react"
import { cn } from "@/lib/utils"

type CardVariant = "glass" | "solid" | "elevated"

const variantClass: Record<CardVariant, string> = {
  glass: "glass-card",
  solid: "bg-card",
  elevated: "bg-surface-1 shadow-soft",
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 卡片变体：glass（玻璃质，默认）/ solid（实色）/ elevated（带阴影的实色） */
  variant?: CardVariant
  /** 是否启用入场动画（IntersectionObserver 触发） */
  animateOnMount?: boolean
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "glass", animateOnMount, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl text-card-foreground transition-colors duration-200",
        variantClass[variant],
        className,
      )}
      {...props}
    />
  )
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  )
)
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
  )
)
CardTitle.displayName = "CardTitle"

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  )
)
CardContent.displayName = "CardContent"

export { Card, CardHeader, CardTitle, CardContent }
export type { CardProps, CardVariant }