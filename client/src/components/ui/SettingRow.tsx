import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * 设置项单行 — 左侧 label + description，右侧 control/children。
 * 替代设置页内 25+ 处 <div className="flex items-center justify-between"><div><p>label</p><p>desc</p></div><Control/></div> 样板。
 *
 * 典型用法：
 *   <SettingRow label="开机自启动" description="系统启动时自动运行 SayDone" control={<Switch />} />
 *   <SettingRow label="显示按住时长" divided control={<Switch checked={...} onChange={...} />} />
 *
 *   <SettingRow label="选择麦克风" divided={false}>
 *     <Select ... />
 *     <Button>测试麦克风</Button>
 *   </SettingRow>
 */
interface SettingRowProps {
  label: React.ReactNode
  description?: React.ReactNode
  /** 内置控件（优先于 children） */
  control?: React.ReactNode
  /** 自定义右侧内容（覆盖 control） */
  children?: React.ReactNode
  /** 加顶部 1px 极轻分割线（用在 Section 内部分隔行） */
  divided?: boolean
  className?: string
}

const SettingRow: React.FC<SettingRowProps> = ({
  label,
  description,
  control,
  children,
  divided = false,
  className,
}) => {
  const right = control ?? children
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3',
        divided && 'mt-4 border-t border-border/30 pt-4',
        className,
      )}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {description != null && (
          <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
        )}
      </div>
      {right != null && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  )
}

export default SettingRow