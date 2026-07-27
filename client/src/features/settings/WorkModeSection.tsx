// 工作模式切换卡片

import PageSection from '@/components/ui/PageSection'
import StatusBadge from '@/components/ui/StatusBadge'
import { Monitor, Globe, type LucideIcon } from 'lucide-react'
import type { WorkMode } from '@/services/transcription'

const modes: Array<{ value: WorkMode; label: string; desc: string; privacy: string; icon: LucideIcon; iconColor: string }> = [
  {
    value: 'local', label: '本地 · 闭门',
    desc: '声入耳即成文，不假外求',
    privacy: '不启 AI 整理则声与文俱留本机；启则文送云端润色。',
    icon: Monitor, iconColor: 'text-primary',
  },
  {
    value: 'cloud_api', label: '云 API · 借力',
    desc: '凭自有云钥，借他山之石',
    privacy: '音与文俱送所配云服务，去处自决。',
    icon: Globe, iconColor: 'text-primary',
  },
]

interface Props {
  value: WorkMode
  onChange: (mode: WorkMode) => void
}

export default function WorkModeSection({ value, onChange }: Props) {
  return (
    <PageSection
      title="听写之制"
      action={<StatusBadge tone="success" dot>就绪</StatusBadge>}
      divided={false}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {modes.map((m) => {
          const isActive = value === m.value
          const Icon = m.icon
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => onChange(m.value)}
              className={`relative rounded-lg p-4 text-left transition-colors ${
                isActive
                  ? 'bg-cta/10 ring-2 ring-cta/40'
                  : 'bg-secondary/40 hover:bg-accent'
              }`}
            >
              <Icon className={`absolute right-3 top-3 h-5 w-5 ${isActive ? m.iconColor : 'text-muted-foreground/30'} transition-colors`} />
              <div className="text-sm font-medium">{m.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{m.desc}</div>
              <div className="mt-2 border-t border-border/50 pt-2 text-xs leading-relaxed text-muted-foreground/80">
                {m.privacy}
              </div>
            </button>
          )
        })}
      </div>
    </PageSection>
  )
}