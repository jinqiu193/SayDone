import GeneralSettingsPage from '@/features/settings/GeneralSettingsPage'

/**
 * /settings 路由现在直接渲染通用设置页（一级菜单，不再嵌套弹窗）。
 * 弹窗（外观/统计/诊断）由 Sidebar 底部「更多」图标触发 SettingsDialog 打开。
 */
export default function Settings() {
  return <GeneralSettingsPage />
}
