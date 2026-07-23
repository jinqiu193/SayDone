import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Palette, Stethoscope, User, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import AppearancePage from './AppearancePage'
import PersonalizationPage from './PersonalizationPage'
import DiagnosticsPage from './DiagnosticsPage'

type SettingsView = 'appearance' | 'personalization' | 'diagnostics'

interface SettingsMenuItem {
  id: SettingsView
  icon: typeof Palette
  label: string
}

const menuItems: SettingsMenuItem[] = [
  { id: 'appearance', icon: Palette, label: '外观' },
  { id: 'personalization', icon: User, label: '使用统计' },
  { id: 'diagnostics', icon: Stethoscope, label: '诊断' },
]

interface SettingsDialogProps {
  /** 可选：受控关闭回调。若不传，使用 react-router 的 navigate('/') 行为 */
  onClose?: () => void
}

export default function SettingsDialog({ onClose }: SettingsDialogProps = {}) {
  const navigate = useNavigate()
  const [activeView, setActiveView] = useState<SettingsView>('appearance')

  const handleClose = () => {
    if (onClose) {
      onClose()
    } else {
      navigate('/')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="relative flex h-[85vh] w-[90vw] max-w-6xl overflow-hidden rounded-xl bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={handleClose}
          className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          aria-label="关闭"
        >
          <X className="h-4 w-4" />
        </button>

        {/* 左侧菜单 */}
        <div className="w-48 border-r border-border/30 bg-card py-8">
          <div className="space-y-0.5 px-3">
            {menuItems.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setActiveView(id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all',
                  activeView === id
                    ? 'bg-accent font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 右侧内容区 */}
        <div className="custom-scrollbar flex-1 overflow-y-auto">
          {activeView === 'appearance' && <AppearancePage />}
          {activeView === 'personalization' && <PersonalizationPage />}
          {activeView === 'diagnostics' && <DiagnosticsPage />}
        </div>
      </div>
    </div>
  )
}
