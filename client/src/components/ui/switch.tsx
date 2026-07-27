import * as React from 'react'
import { cn } from '@/lib/utils'

interface SwitchProps {
  checked: boolean
  onChange: () => void
  label?: string
  disabled?: boolean
  className?: string
  /** 'sm' 适合紧凑列表行 */
  size?: 'default' | 'sm'
  /** 可访问性描述 */
  description?: string
}

/**
 * 统一 Switch 开关组件
 * default: h-6 w-11 / sm: h-4 w-7
 */
export function Switch({ checked, onChange, label, disabled, className, size = 'default', description }: SwitchProps) {
  const sm = size === 'sm'
  const switchId = React.useId()
  const descId = description ? `${switchId}-desc` : undefined

  return (
    <div className={cn('inline-flex items-center gap-2', disabled && 'opacity-50', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={descId}
        id={switchId}
        onClick={onChange}
        disabled={disabled}
        className={cn(
          'relative shrink-0 cursor-pointer rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          sm ? 'h-4 w-7' : 'h-6 w-11',
          checked ? 'bg-primary' : 'bg-muted',
          disabled && 'cursor-not-allowed',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 rounded-full bg-card shadow transition-transform',
            sm ? 'h-3 w-3' : 'h-5 w-5',
            checked && (sm ? 'translate-x-3' : 'translate-x-5'),
          )}
        />
      </button>
      {label && (
        <label htmlFor={switchId} className={cn('text-sm cursor-pointer', disabled && 'cursor-not-allowed')}>
          {label}
        </label>
      )}
      {description && (
        <span id={descId} className="text-xs text-muted-foreground">
          {description}
        </span>
      )}
    </div>
  )
}
