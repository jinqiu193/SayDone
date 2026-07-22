import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * 设置页"小节卡片" — 统一的 Card + 标题 + 描述 + 可选右侧操作 + 内容容器。
 * 替代设置页内 30+ 处重复的 <Card><CardContent className="p-6"><h2>...</h2>...</CardContent></Card> 样板。
 *
 * 典型用法：
 *   <PageSection title="麦克风" description="选择要使用的麦克风">
 *     <SettingRow label="选择麦克风" control={<Select ... />} />
 *   </PageSection>
 *
 *   <PageSection title="工作模式" action={<StatusBadge tone="success" dot>已连接</StatusBadge>}>
 *     <div className="grid gap-3 sm:grid-cols-3">...</div>
 *   </PageSection>
 *
 *   <PageSection title="识别测试" description="..." action={<Buttons /> divided={false}>
 *     {result && <ResultCard />}
 *   </PageSection>
 */
interface PageSectionProps {
  title: string
  description?: React.ReactNode
  /** 顶部右侧操作区（Switch / 徽章 / 按钮组 / Tab 切换等） */
  action?: React.ReactNode
  /** 内容区是否使用 space-y-4 分隔（默认 true）。当内容自带 grid/flex 间距时设为 false */
  divided?: boolean
  children?: React.ReactNode
  className?: string
}

const PageSection: React.FC<PageSectionProps> = ({
  title,
  description,
  action,
  divided = true,
  children,
  className,
}) => {
  const hasHeaderAction = action != null

  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div
          className={cn(
            hasHeaderAction || description ? 'mb-4' : '',
            'flex items-start justify-between gap-3',
          )}
        >
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{title}</h2>
            {description && (
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {action != null && (
            <div className="flex shrink-0 items-center gap-2">{action}</div>
          )}
        </div>
        {divided ? <div className="space-y-4">{children}</div> : children}
      </CardContent>
    </Card>
  )
}

export default PageSection