import type { ThemeDefinition } from './types'

/**
 * 墨砚 — 极深墨
 * 浓郁深邃，墨黑到深靛渐变
 */
const moYan: ThemeDefinition = {
  id: 'mo-yan',
  name: '墨砚',
  isDark: true,
  previewColors: {
    bg: '#0a0d14',
    sidebar: '#10141d',
    primary: '#7a8fff',
    accent: '#1a2030',
  },
  vars: {
    // 基础色
    '--background': '225 25% 5%',
    '--foreground': '220 18% 90%',
    '--card': '225 22% 8%',
    '--card-foreground': '220 18% 90%',
    '--primary': '230 85% 70%',
    '--primary-foreground': '225 30% 6%',
    '--secondary': '225 18% 14%',
    '--secondary-foreground': '220 18% 90%',
    '--muted': '225 18% 12%',
    '--muted-foreground': '220 12% 60%',
    '--accent': '225 22% 18%',
    '--accent-foreground': '220 18% 90%',
    '--destructive': '0 70% 60%',
    '--destructive-foreground': '225 30% 6%',
    '--border': '225 18% 18%',
    '--input': '225 18% 18%',
    '--ring': '230 85% 70%',
    '--radius': '0.75rem',

    // CTA
    '--cta': '230 85% 70%',
    '--cta-hover': '230 85% 76%',
    '--cta-foreground': '225 30% 6%',

    // 区域色
    '--sidebar-bg': '225 22% 7%',
    '--sidebar-border': '225 18% 18%',
    '--sidebar-item-active-bg': '230 50% 22%',
    '--sidebar-item-hover-bg': '225 22% 14%',
    '--sidebar-text': '220 12% 60%',
    '--sidebar-text-active': '230 85% 80%',
    '--titlebar-bg': '225 22% 6%',
    '--titlebar-text': '220 12% 60%',
    '--titlebar-close-hover-bg': '0 70% 60%',
    '--titlebar-close-hover-text': '220 18% 90%',

    // 表单
    '--input-bg': '225 22% 10%',
    '--input-border': '225 18% 20%',
    '--input-focus-border': '230 85% 70%',
    '--input-focus-ring': '230 85% 70%',
    '--input-placeholder': '220 10% 48%',

    // 状态色
    '--success': '142 60% 55%',
    '--success-foreground': '225 30% 6%',
    '--warning': '38 88% 62%',
    '--warning-foreground': '225 30% 6%',
    '--info': '200 80% 65%',
    '--info-foreground': '225 30% 6%',

    // primary 色阶（深靛紫）
    '--primary-50': '230 50% 96%',
    '--primary-100': '230 60% 90%',
    '--primary-200': '230 70% 82%',
    '--primary-300': '230 78% 76%',
    '--primary-400': '230 82% 72%',
    '--primary-500': '230 85% 68%',
    '--primary-600': '230 80% 56%',
    '--primary-700': '230 75% 44%',
    '--primary-800': '230 70% 32%',
    '--primary-900': '230 65% 20%',

    // secondary 色阶（墨黑）
    '--secondary-50': '225 18% 96%',
    '--secondary-100': '225 18% 90%',
    '--secondary-200': '225 18% 80%',
    '--secondary-300': '225 18% 64%',
    '--secondary-400': '225 18% 48%',
    '--secondary-500': '225 18% 32%',
    '--secondary-600': '225 18% 22%',
    '--secondary-700': '225 18% 16%',
    '--secondary-800': '225 18% 10%',
    '--secondary-900': '225 18% 6%',

    // destructive 色阶
    '--destructive-50': '0 70% 96%',
    '--destructive-100': '0 70% 90%',
    '--destructive-200': '0 70% 80%',
    '--destructive-300': '0 70% 70%',
    '--destructive-400': '0 70% 62%',
    '--destructive-500': '0 70% 55%',
    '--destructive-600': '0 65% 45%',
    '--destructive-700': '0 60% 36%',
    '--destructive-800': '0 55% 28%',
    '--destructive-900': '0 50% 20%',

    // 渐变（墨黑→深靛）
    '--gradient-from': '225 25% 4%',
    '--gradient-via': '240 20% 6%',
    '--gradient-to': '220 25% 5%',
    '--gradient-angle': '170deg',
    '--accent-gradient-from': '230 85% 65%',
    '--accent-gradient-to': '260 80% 70%',

    // 玻璃
    '--glass-bg': '220 18% 90% / 0.05',
    '--glass-border': '220 18% 90% / 0.09',
    '--glass-blur': '12px',
    '--glass-shadow': '0 4px 24px hsl(225 30% 3% / 0.40)',

    // 表面层级
    '--surface-1': '225 22% 8%',
    '--surface-2': '225 22% 12%',
    '--surface-3': '225 22% 16%',

    // 阴影/光晕
    '--shadow-soft': '0 2px 8px hsl(225 30% 3% / 0.50)',
    '--shadow-elevated': '0 12px 32px hsl(225 30% 3% / 0.60)',
    '--highlight-glow': '0 0 0 3px hsl(230 85% 70% / 0.30)',
    '--status-success-glow': '142 60% 55% / 0.40',
    '--status-warning-glow': '38 88% 62% / 0.40',
    '--status-info-glow': '200 80% 65% / 0.40',
    '--status-error-glow': '0 70% 60% / 0.40',

    // 浮窗（深墨主调，accent = 深靛紫）
    '--overlay-bg': '225 25% 4%',
    '--overlay-text': '220 18% 92%',
    '--overlay-text-muted': '220 14% 60%',
    '--overlay-text-dim': '220 12% 40%',
    '--overlay-border': '220 18% 92% / 0.25',
    '--overlay-surface': '220 18% 92% / 0.06',
    '--overlay-accent': '230 85% 72%',
  },
  fonts: {
    body: '"PingFang SC", "Microsoft YaHei", "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif',
    mono: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
  },
}

export default moYan