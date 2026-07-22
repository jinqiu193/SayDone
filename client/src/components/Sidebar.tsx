import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Home, Clock, BookOpen, Settings, Info, Wifi, WifiOff, AudioLines, Sparkles, Wand2, NotebookPen, Database } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/tooltip'
import { useConnectionStatus } from '@/hooks/useConnectionStatus'
import { getWorkMode, subscribeWorkMode, type WorkMode } from '@/services/transcription'
import SettingsDialog from '@/features/settings/SettingsDialog'
import Seal from '@/components/Seal'

const dailyNavItems = [
  { to: '/', icon: Home, label: '工作台' },
  { to: '/history', icon: Clock, label: '历史记录' },
  { to: '/meeting', icon: NotebookPen, label: '会议纪要' },
  { to: '/knowledge', icon: Database, label: '知识库' },
]

// 一级配置菜单：包含完整的设置入口，AI 供应商下方放「设置」直达 GeneralSettingsPage
const configNavItems = [
  { to: '/voice-engine', icon: AudioLines, label: '语音引擎' },
  { to: '/hotwords', icon: BookOpen, label: '热词词库' },
  { to: '/ai-instructions', icon: Wand2, label: '指令整理' },
  { to: '/ai-service', icon: Sparkles, label: 'AI 供应商' },
  { to: '/settings', icon: Settings, label: '通用设置' },
]

// 底部仅保留「关于」+ 连接指示器；底部"设置"图标已上移到 configNavItems，
// 这里新增「更多」图标用于弹出 SettingsDialog（仅剩 外观/统计/诊断 3 个页签）
const footerNavItems = [
  { to: '/about', icon: Info, label: '关于本机' },
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
          // 衬线宋体 + 字距舒展 + 行高宽 + 14px（中文字号）
          'flex items-center gap-3 rounded-lg px-3 py-1.5 text-[14px] font-serif tracking-[0.06em] transition-colors',
          isActive
            ? 'bg-sidebar-item-active font-medium text-primary'
            : 'text-sidebar-text hover:bg-sidebar-item-hover hover:text-sidebar-text-active',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span className="leading-[1.5]">{label}</span>
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
        <Icon className="h-4 w-4" strokeWidth={1.75} />
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
    <aside className="flex w-48 flex-col border-r border-sidebar-border bg-sidebar">
      {/* 印章品牌头部 — 导航栏之上 */}
      <div className="flex flex-col items-center gap-2 border-b border-sidebar-border/60 px-3 py-4">
        <Seal size={32} />
        <span className="font-serif text-[11px] font-medium tracking-[0.25em] text-muted-foreground">
          说 · 录
        </span>
      </div>

      <nav className="flex flex-1 flex-col py-4">
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
      </nav>

      <div className="space-y-3 border-t border-sidebar-border/60 px-3 py-3">
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
    </aside>
  )
}
