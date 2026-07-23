// AI 整理开关卡片（独立组件）
// 状态接入全局 store，与标题栏的开关保持同步

import PageSection from '@/components/ui/PageSection'
import { Switch } from '@/components/ui/switch'
import { useAiEnabled } from '@/hooks/useAiEnabled'
import { toggleAiEnabled } from '@/stores/aiEnabled'

export default function AIProofreadToggle() {
  const aiEnabled = useAiEnabled()

  return (
    <PageSection
      title="AI 整理"
      description={
        aiEnabled
          ? '开启后，会自动整理口述内容，修正错字、整理语序'
          : '关闭后，将原样输出语音识别的文字，不做修改'
      }
      action={<Switch checked={aiEnabled} onChange={() => { void toggleAiEnabled() }} />}
    />
  )
}