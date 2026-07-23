import { useId } from 'react'
import { cn } from '@/lib/utils'

interface KeyDividerProps {
  /** 回纹单元重复次数（视觉宽度参考） */
  repeats?: number
  className?: string
  /** 描边色，默认 currentColor（继承文字色） */
  color?: string
  /** 描边不透明度，默认 0.4（克制感） */
  opacity?: number
}

/**
 * 中式回纹分隔线 — 平铺回字纹单元，替代普通 border-t / hr。
 * 高度 8px、不喧宾夺主，仅作气韵分割。
 *
 * 用法：
 *   <KeyDivider />
 *   <KeyDivider repeats={10} className="my-4" />
 *   <KeyDivider color="hsl(var(--primary))" opacity={0.5} />
 */
export default function KeyDivider({
  repeats = 6,
  className,
  color = 'currentColor',
  opacity = 0.4,
}: KeyDividerProps) {
  // 单元宽度 16px → 总宽度 = repeats * 16
  const width = repeats * 16
  const id = useId().replace(/:/g, '_')
  const patternId = `key-pattern-${id}`

  return (
    <div
      className={cn('flex h-2 items-center justify-center', className)}
      role="separator"
      aria-orientation="horizontal"
    >
      <svg
        width={width}
        height="8"
        viewBox={`0 0 ${width} 8`}
        preserveAspectRatio="xMinYMid meet"
        style={{ opacity }}
        aria-hidden="true"
      >
        {/* 单个回字纹单元：2 个并排方框 + 中央连接 + 2 角缺口 */}
        <defs>
          <pattern id={patternId} width="16" height="8" patternUnits="userSpaceOnUse">
            <path
              d="M0 0 H6 V8 H0 Z M10 0 H16 V8 H10 Z M6 2 H10 V6 H6 Z"
              fill="none"
              stroke={color}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </pattern>
        </defs>
        <rect width={width} height="8" fill={`url(#${patternId})`} />
      </svg>
    </div>
  )
}