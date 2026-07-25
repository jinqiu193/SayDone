import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-cta text-cta-foreground shadow-[0_2px_8px_hsl(var(--cta)/0.25)] hover:bg-cta-hover hover:shadow-[0_4px_14px_hsl(var(--cta)/0.35)]",
        destructive: "bg-destructive text-destructive-foreground shadow-[0_2px_8px_hsl(var(--destructive)/0.25)] hover:bg-destructive/90 hover:shadow-[0_4px_14px_hsl(var(--destructive)/0.35)]",
        outline: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-cta underline-offset-4 hover:underline",
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
    VariantProps<typeof buttonVariants> {
  /** 是否显示加载状态 */
  isLoading?: boolean
  /** 加载状态提示文本 */
  loadingText?: string
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, loadingText, disabled, children, ...props }, ref) => {
    const isDisabled = disabled || isLoading

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={isDisabled}
        aria-busy={isLoading}
        {...props}
      >
        {isLoading && (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {loadingText || <span className="sr-only">加载中</span>}
          </>
        )}
        {!isLoading && children}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
