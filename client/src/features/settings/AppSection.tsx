import PageSection from '@/components/ui/PageSection'
import SettingRow from '@/components/ui/SettingRow'
import { Switch } from '@/components/ui/switch'

export default function AppSection({
  autoLaunch,
  onToggleAutoLaunch,
  autoCheckUpdate,
  onToggleAutoCheckUpdate,
}: {
  autoLaunch: boolean
  onToggleAutoLaunch: () => void
  autoCheckUpdate: boolean
  onToggleAutoCheckUpdate: () => void
}) {
  return (
    <PageSection title="应用">
      <SettingRow
        label="开机自启动"
        description="系统启动时自动运行 SayDone"
        control={<Switch checked={autoLaunch} onChange={onToggleAutoLaunch} />}
      />
      <SettingRow
        label="自动检测更新"
        description="启动时自动检查是否有新版本可用"
        divided
        control={<Switch checked={autoCheckUpdate} onChange={onToggleAutoCheckUpdate} />}
      />
    </PageSection>
  )
}