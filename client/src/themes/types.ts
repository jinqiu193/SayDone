/** 主题系统类型定义 */

/** 全局语义 CSS 变量 — 所有主题必须提供 */
export interface ThemeVars {
  // 基础色
  '--background': string
  '--foreground': string
  '--card': string
  '--card-foreground': string
  '--primary': string
  '--primary-foreground': string
  '--secondary': string
  '--secondary-foreground': string
  '--muted': string
  '--muted-foreground': string
  '--accent': string
  '--accent-foreground': string
  '--destructive': string
  '--destructive-foreground': string
  '--border': string
  '--input': string
  '--ring': string
  '--radius': string

  // CTA 强调色（pill / 主操作按钮）
  '--cta': string
  '--cta-hover': string
  '--cta-foreground': string

  // 区域色
  '--sidebar-bg': string
  '--sidebar-border': string
  '--sidebar-item-active-bg': string
  '--sidebar-item-hover-bg': string
  '--sidebar-text': string
  '--sidebar-text-active': string
  '--titlebar-bg': string
  '--titlebar-text': string
  '--titlebar-close-hover-bg': string
  '--titlebar-close-hover-text': string

  // 表单控件
  '--input-bg': string
  '--input-border': string
  '--input-focus-border': string
  '--input-focus-ring': string
  '--input-placeholder': string

  // 状态色
  '--success': string
  '--success-foreground': string
  '--warning': string
  '--warning-foreground': string
  '--info': string
  '--info-foreground': string

  // ===== 色阶族（10 阶，由浅到深）=====
  // 日常组件继续用 bg-primary；需要色阶时 bg-primary-50/100/.../900
  '--primary-50': string
  '--primary-100': string
  '--primary-200': string
  '--primary-300': string
  '--primary-400': string
  '--primary-500': string
  '--primary-600': string
  '--primary-700': string
  '--primary-800': string
  '--primary-900': string
  '--secondary-50': string
  '--secondary-100': string
  '--secondary-200': string
  '--secondary-300': string
  '--secondary-400': string
  '--secondary-500': string
  '--secondary-600': string
  '--secondary-700': string
  '--secondary-800': string
  '--secondary-900': string
  '--destructive-50': string
  '--destructive-100': string
  '--destructive-200': string
  '--destructive-300': string
  '--destructive-400': string
  '--destructive-500': string
  '--destructive-600': string
  '--destructive-700': string
  '--destructive-800': string
  '--destructive-900': string

  // ===== 渐变系统 =====
  '--gradient-from': string
  '--gradient-via': string
  '--gradient-to': string
  '--gradient-angle': string
  '--accent-gradient-from': string
  '--accent-gradient-to': string

  // ===== 玻璃系统 =====
  '--glass-bg': string
  '--glass-border': string
  '--glass-blur': string
  '--glass-shadow': string

  // ===== 表面层级 =====
  '--surface-1': string
  '--surface-2': string
  '--surface-3': string

  // ===== 阴影/光晕 =====
  '--shadow-soft': string
  '--shadow-elevated': string
  '--highlight-glow': string
  '--status-success-glow': string
  '--status-warning-glow': string
  '--status-info-glow': string
  '--status-error-glow': string

  // ===== 浮窗系统（深色背景，accent 取自主主题）=====
  '--overlay-bg': string
  '--overlay-text': string
  '--overlay-text-muted': string
  '--overlay-text-dim': string
  '--overlay-border': string
  '--overlay-surface': string
  '--overlay-accent': string
}

/** 主题扩展变量 — 主题独有的特色变量（可选） */
export type ThemeExtras = Record<string, string>

/** 主题字体配置（可选） */
export interface ThemeFonts {
  /** body 正文字体 */
  body?: string
  /** 等宽字体 */
  mono?: string
}

/** 主题定义 */
export interface ThemeDefinition {
  /** 唯一标识 */
  id: string
  /** 显示名称 */
  name: string
  /** 是否为暗色主题（控制 Tailwind dark: 前缀） */
  isDark: boolean
  /** 预览色（用于设置页面的主题选择器） */
  previewColors: {
    bg: string
    sidebar: string
    primary: string
    accent: string
  }
  /** 全局 CSS 变量 */
  vars: ThemeVars
  /** 主题独有的扩展变量 */
  extras?: ThemeExtras
  /** 主题字体（不设置则使用全局默认字体） */
  fonts?: ThemeFonts
}

/** 主题 ID 类型 */
export type ThemeId =
  | 'han-shan'
  | 'ye-lan'
  | 'wu-song'
  | 'qing-lin'
  | 'mo-yan'
  | 'chi-tao'
  | 'tang-li'
  | 'qing-ci'
  // 旧 id 别名（保留用户设置，向后兼容）
  | 'light'
  | 'dark'
  | 'claude'