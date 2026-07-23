import { cn } from '@/lib/utils'

interface SealProps {
  /** 尺寸（px），默认 28 */
  size?: number
  /** 色调：primary=青瓷/主色；vermilion=朱砂 */
  tone?: 'primary' | 'vermilion'
  className?: string
  /** 自定义字符（默认「说」） */
  character?: string
}

/**
 * 中式印章 — 圆角矩形外框 + 内嵌回字纹边框 + 中央汉字。
 * 用 currentColor 跟随主题色，stroke 用 1.5px non-scaling 保持锐利。
 *
 * 用法：
 *   <Seal />
 *   <Seal size={32} tone="vermilion" character="錄" />
 */
export default function Seal({
  size = 28,
  tone = 'primary',
  className,
  character = '说',
}: SealProps) {
  const toneClass = tone === 'vermilion' ? 'text-[hsl(14_58%_42%)]' : 'text-primary'

  return (
    <svg
      viewBox="0 0 60 60"
      width={size}
      height={size}
      className={cn('shrink-0', toneClass, className)}
      aria-hidden="true"
    >
      {/* 外圆角矩形 */}
      <rect
        x="3"
        y="3"
        width="54"
        height="54"
        rx="6"
        ry="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        opacity="0.9"
      />
      {/* 内嵌回字纹边框（4 角缺口） */}
      <path
        d="M10 10 H22 V14 H14 V22 H10 Z
           M50 10 H38 V14 H46 V22 H50 Z
           M10 50 H14 V38 H22 V50 Z
           M50 50 H46 V38 H38 V50 Z"
        fill="currentColor"
        opacity="0.85"
      />
      {/* 中央汉字 */}
      <text
        x="30"
        y="30"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize="22"
        fontWeight="700"
        fontFamily='"PingFang SC", "Microsoft YaHei", "STSong", "STKaiti", serif'
        fill="currentColor"
      >
        {character}
      </text>
    </svg>
  )
}