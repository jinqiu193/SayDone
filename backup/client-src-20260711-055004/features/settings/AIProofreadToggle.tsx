// AI 整理开关卡片（独立组件）
// 状态接入全局 store，与标题栏的开关保持同步

import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { useAiEnabled } from '@/hooks/useAiEnabled'
import { toggleAiEnabled } from '@/stores/aiEnabled'

export default function AIProofreadToggle() {
  const aiEnabled = useAiEnabled()

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">AI 整理</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {aiEnabled
                ? '开启后，会自动整理口述内容，修正错字、整理语序'
                : '关闭后，将原样输出语音识别的文字，不做修改'}
            </p>
          </div>
          <Switch checked={aiEnabled} onChange={() => { void toggleAiEnabled() }} />
        </div>
      </CardContent>
    </Card>
  )
}
