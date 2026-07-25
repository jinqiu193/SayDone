/**
 * 主题注册表 + 切换逻辑
 *
 * 用法：
 *   import { applyTheme, getTheme, themeList } from '@/themes'
 *   applyTheme('ye-lan')
 */
import type { ThemeDefinition, ThemeId } from './types'
import hanShan from './han-shan'
import yeLan from './ye-lan'
import wuSong from './wu-song'
import qingLin from './qing-lin'
import moYan from './mo-yan'
import chiTao from './chi-tao'
import tangLi from './tang-li'
import qingCi from './qing-ci'

/** 所有已注册主题 */
const themes: Record<string, ThemeDefinition> = {
  'han-shan': hanShan,
  'ye-lan': yeLan,
  'wu-song': wuSong,
  'qing-lin': qingLin,
  'mo-yan': moYan,
  'chi-tao': chiTao,
  'tang-li': tangLi,
  'qing-ci': qingCi,
}

/** 旧 id → 新 id 映射（向后兼容，保留用户设置） */
const LEGACY_ALIAS: Record<string, ThemeId> = {
  light: 'han-shan',
  dark: 'ye-lan',
  teal: 'wu-song',
  'teal-dark': 'qing-lin',
}

/** 主题列表（用于 UI 渲染，按指定顺序） */
export const themeList: ThemeDefinition[] = [
  hanShan,
  yeLan,
  wuSong,
  qingLin,
  moYan,
  chiTao,
  tangLi,
  qingCi,
]

/** 解析主题 id（自动处理旧 id 别名） */
function resolveId(id: string): string {
  return LEGACY_ALIAS[id] || id
}

/** 获取主题定义，找不到则回退 han-shan */
export function getTheme(id: string): ThemeDefinition {
  const resolved = resolveId(id)
  return themes[resolved] || themes['han-shan']
}

/** 当前已应用的主题 ID */
let currentThemeId: string = 'han-shan'

/** 获取当前主题 ID */
export function getCurrentThemeId(): string {
  return currentThemeId
}

/** 默认字体（与 index.css body 一致） */
const DEFAULT_FONT_BODY = '"PingFang SC", "Microsoft YaHei", "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif'

/**
 * 应用主题：将 CSS 变量注入 :root，切换 dark class，设置字体
 * @returns 实际应用的主题 ID
 */
export function applyTheme(id: string): string {
  const theme = getTheme(id)
  const root = document.documentElement

  // 注入全局变量
  const allVars = { ...theme.vars, ...(theme.extras || {}) }
  for (const [key, value] of Object.entries(allVars)) {
    root.style.setProperty(key, value)
  }

  // 切换字体
  document.body.style.fontFamily = theme.fonts?.body || DEFAULT_FONT_BODY

  // 切换 dark class（Tailwind dark: 前缀）
  if (theme.isDark) {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }

  // 切换主题标识 class（方便主题特定 CSS）
  for (const t of themeList) {
    root.classList.remove(`theme-${t.id}`)
  }
  root.classList.add(`theme-${theme.id}`)

  currentThemeId = theme.id
  return theme.id
}

export type { ThemeDefinition, ThemeId }