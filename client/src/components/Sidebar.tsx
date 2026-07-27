import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Home, Clock, BookOpen, Settings, Info, AudioLines, Sparkles, Wand2, NotebookPen, Database } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/tooltip'
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

// 底部仅保留「关于」+「更多设置」；底部"设置"图标已上移到 configNavItems，
// 「更多」图标用于弹出 SettingsDialog（仅剩 外观/统计/诊断 3 个页签）
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
        </div>
      </div>

      {moreOpen && <SettingsDialog onClose={() => setMoreOpen(false)} />}
    </aside>
  )
}
