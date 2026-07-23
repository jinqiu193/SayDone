import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Home, Clock, BookOpen, Settings, Info, Wifi, WifiOff, AudioLines, Sparkles, Wand2, NotebookPen, Database } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/tooltip'
import { useConnectionStatus } from '@/hooks/useConnectionStatus'
import { getWorkMode, subscribeWorkMode, type WorkMode } from '@/services/transcription'
import SettingsDialog from '@/features/settings/SettingsDialog'

const dailyNavItems = [
  { to: '/', icon: Home, label: '首页' },
  { to: '/history', icon: Clock, label: '历史' },
  { to: '/meeting', icon: NotebookPen, label: '会议纪要' },
  { to: '/knowledge', icon: Database, label: '知识库' },
]

// 一级配置菜单：包含完整的设置入口，AI 供应商下方放「设置」直达 GeneralSettingsPage
const configNavItems = [
  { to: '/voice-engine', icon: AudioLines, label: '语音引擎' },
  { to: '/hotwords', icon: BookOpen, label: '热词' },
  { to: '/ai-instructions', icon: Wand2, label: 'AI 整理' },
  { to: '/ai-service', icon: Sparkles, label: 'AI 供应商' },
  { to: '/settings', icon: Settings, label: '设置' },
]

// 底部仅保留「关于」+ 连接指示器；底部"设置"图标已上移到 configNavItems，
// 这里新增「更多」图标用于弹出 SettingsDialog（仅剩 外观/统计/诊断 3 个页签）
const footerNavItems = [
  { to: '/about', icon: Info, label: '关于' },
]

function NavItem({
  to,
  icon: Icon,
  label,
}: {
  to: string
  icon: typeof Home
  label: string
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
          isActive ? 'bg-sidebar-item-active font-medium text-sidebar-text-active' : 'text-sidebar-text hover:bg-sidebar-item-hover hover:text-sidebar-text-active',
        )
      }
    >
      <Icon className="h-4 w-4" />
      {label}
    </NavLink>
  )
}

function IconOnlyNavItem({
  to,
  icon: Icon,
  label,
}: {
  to: string
  icon: typeof Home
  label: string
}) {
  return (
    <Tooltip content={label}>
      <NavLink
        to={to}
        className={({ isActive }) =>
          cn(
            'flex items-center justify-center rounded-lg p-2 transition-colors',
            isActive ? 'bg-sidebar-item-active text-sidebar-text-active' : 'text-sidebar-text hover:bg-sidebar-item-hover hover:text-sidebar-text-active',
          )
        }
      >
        <Icon className="h-4 w-4" />
      </NavLink>
    </Tooltip>
  )
}

const statusConfig = {
  connected:    { icon: Wifi,    color: 'text-success', label: '后端已连接' },
  connecting:   { icon: Wifi,    color: 'text-warning animate-pulse', label: '正在连接…' },
  disconnected: { icon: WifiOff, color: 'text-muted-foreground', label: '后端未连接' },
  error:        { icon: WifiOff, color: 'text-destructive', label: '连接失败' },
} as const

function ConnectionIndicator() {
  const status = useConnectionStatus()
  // 用 useState + 订阅，让 init 完成后 workMode 变化能触发 re-render
  // （否则 render-time 直接读 getWorkMode() 不会响应模块变量的后续变更）
  const [workMode, setWorkMode] = useState<WorkMode>(getWorkMode)
  useEffect(() => subscribeWorkMode(setWorkMode), [])

  // 非服务器模式不显示连接指示器
  if (workMode !== 'server') return null

  const { icon: StatusIcon, color, label } = statusConfig[status]
  return (
    <Tooltip content={label}>
      <div className="flex items-center justify-center rounded-lg p-2">
        <StatusIcon className={cn('h-4 w-4', color)} />
      </div>
    </Tooltip>
  )
}

export default function Sidebar() {
  // 控制「更多设置」弹窗（仅含外观/统计/诊断 3 个页签）的显隐
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <nav className="flex w-48 flex-col border-r border-sidebar-border bg-sidebar py-4">
      <div className="flex-1 space-y-1 px-3">
        {dailyNavItems.map(({ to, icon, label }) => (
          <NavItem key={to} to={to} icon={icon} label={label} />
        ))}

        <div className="px-1 py-3">
          <div className="h-px bg-[linear-gradient(to_right,transparent_0%,hsl(var(--sidebar-border))_5%,hsl(var(--sidebar-border))_95%,transparent_100%)]" />
        </div>
        {configNavItems.map(({ to, icon, label }) => (
          <NavItem key={to} to={to} icon={icon} label={label} />
        ))}
      </div>

      <div className="space-y-3 px-3 pt-4">
        <div className="h-px bg-[linear-gradient(to_right,transparent_0%,hsl(var(--sidebar-border))_5%,hsl(var(--sidebar-border))_95%,transparent_100%)]" />
        <div className="flex items-center gap-1">
          {footerNavItems.map(({ to, icon, label }) => (
            <IconOnlyNavItem key={to} to={to} icon={icon} label={label} />
          ))}
          {/* 「更多」图标：弹出 SettingsDialog（剩余 外观/统计/诊断 3 个页签） */}
          <Tooltip content="更多设置">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-label="更多设置"
              className="flex items-center justify-center rounded-lg p-2 text-sidebar-text transition-colors hover:bg-sidebar-item-hover hover:text-sidebar-text-active"
            >
              <Settings className="h-4 w-4" />
            </button>
          </Tooltip>
          <ConnectionIndicator />
        </div>
      </div>

      {moreOpen && <SettingsDialog onClose={() => setMoreOpen(false)} />}
    </nav>
  )
}
