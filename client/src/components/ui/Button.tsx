import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      // 主按钮默认 = 亮宝蓝（CTA 色），带渐变 + 阴影，hover 时阴影抬升
      variant: {
        default: "bg-cta text-cta-foreground shadow-[0_2px_8px_hsl(var(--cta)/0.25)] hover:bg-cta-hover hover:shadow-[0_4px_14px_hsl(var(--cta)/0.35)]",
        destructive: "bg-destructive text-destructive-foreground shadow-[0_2px_8px_hsl(var(--destructive)/0.25)] hover:bg-destructive/90 hover:shadow-[0_4px_14px_hsl(var(--destructive)/0.35)]",
        outline: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-cta underline-offset-4 hover:underline",
        // 圆形实色 CTA — Typeless "新词" 风格
        pill: "rounded-full bg-cta text-cta-foreground shadow-[0_2px_8px_hsl(var(--cta)/0.25)] hover:bg-cta-hover hover:shadow-[0_4px_14px_hsl(var(--cta)/0.35)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  )
)
Button.displayName = "Button"

export { Button, buttonVariants }
