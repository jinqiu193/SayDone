import type { ThemeDefinition } from './types'

/**
 * 青林 — 冷翠绿（基于旧 teal-dark）
 * 墨翠深邃，森林静谧
 */
const qingLin: ThemeDefinition = {
  id: 'qing-lin',
  name: '青林',
  isDark: true,
  previewColors: {
    bg: '#0f1816',
    sidebar: '#14201d',
    primary: '#4ec5b8',
    accent: '#1d2f2b',
  },
  vars: {
    // 基础色
    '--background': '180 12% 8%',
    '--foreground': '175 18% 90%',
    '--card': '180 14% 11%',
    '--card-foreground': '175 18% 90%',
    '--primary': '174 65% 50%',
    '--primary-foreground': '180 30% 8%',
    '--secondary': '180 14% 16%',
    '--secondary-foreground': '175 18% 90%',
    '--muted': '180 14% 14%',
    '--muted-foreground': '175 12% 60%',
    '--accent': '180 18% 20%',
    '--accent-foreground': '175 18% 90%',
    '--destructive': '0 65% 58%',
    '--destructive-foreground': '180 30% 8%',
    '--border': '180 14% 20%',
    '--input': '180 14% 20%',
    '--ring': '174 65% 50%',
    '--radius': '0.75rem',

    // CTA
    '--cta': '174 70% 55%',
    '--cta-hover': '174 70% 62%',
    '--cta-foreground': '180 30% 8%',

    // 区域色
    '--sidebar-bg': '180 16% 10%',
    '--sidebar-border': '180 14% 20%',
    '--sidebar-item-active-bg': '174 40% 22%',
    '--sidebar-item-hover-bg': '180 18% 16%',
    '--sidebar-text': '175 12% 60%',
    '--sidebar-text-active': '174 65% 70%',
    '--titlebar-bg': '180 16% 9%',
    '--titlebar-text': '175 12% 60%',
    '--titlebar-close-hover-bg': '0 65% 58%',
    '--titlebar-close-hover-text': '175 18% 90%',

    // 表单
    '--input-bg': '180 14% 13%',
    '--input-border': '180 14% 22%',
    '--input-focus-border': '174 65% 50%',
    '--input-focus-ring': '174 65% 50%',
    '--input-placeholder': '175 10% 48%',

    // 状态色
    '--success': '152 60% 50%',
    '--success-foreground': '180 30% 8%',
    '--warning': '38 88% 60%',
    '--warning-foreground': '180 30% 8%',
    '--info': '195 75% 60%',
    '--info-foreground': '180 30% 8%',

    // primary 色阶（青绿）
    '--primary-50': '174 50% 96%',
    '--primary-100': '174 55% 90%',
    '--primary-200': '174 60% 80%',
    '--primary-300': '174 62% 70%',
    '--primary-400': '174 65% 60%',
    '--primary-500': '174 65% 50%',
    '--primary-600': '174 65% 40%',
    '--primary-700': '174 60% 32%',
    '--primary-800': '174 55% 24%',
    '--primary-900': '174 50% 16%',

    // secondary 色阶（深灰青）
    '--secondary-50': '180 14% 96%',
    '--secondary-100': '180 14% 90%',
    '--secondary-200': '180 14% 80%',
    '--secondary-300': '180 14% 65%',
    '--secondary-400': '180 14% 50%',
    '--secondary-500': '180 14% 35%',
    '--secondary-600': '180 14% 25%',
    '--secondary-700': '180 14% 18%',
    '--secondary-800': '180 14% 12%',
    '--secondary-900': '180 14% 8%',

    // destructive 色阶
    '--destructive-50': '0 65% 96%',
    '--destructive-100': '0 65% 90%',
    '--destructive-200': '0 65% 80%',
    '--destructive-300': '0 65% 70%',
    '--destructive-400': '0 65% 62%',
    '--destructive-500': '0 65% 55%',
    '--destructive-600': '0 60% 45%',
    '--destructive-700': '0 55% 36%',
    '--destructive-800': '0 50% 28%',
    '--destructive-900': '0 45% 20%',

    // 渐变（墨翠→深青）
    '--gradient-from': '180 20% 7%',
    '--gradient-via': '190 18% 9%',
    '--gradient-to': '170 20% 8%',
    '--gradient-angle': '160deg',
    '--accent-gradient-from': '174 65% 50%',
    '--accent-gradient-to': '195 60% 55%',

    // 玻璃
    '--glass-bg': '175 18% 90% / 0.06',
    '--glass-border': '175 18% 90% / 0.10',
    '--glass-blur': '12px',
    '--glass-shadow': '0 4px 24px hsl(180 30% 4% / 0.30)',

    // 表面层级
    '--surface-1': '180 14% 11%',
    '--surface-2': '180 14% 15%',
    '--surface-3': '180 14% 19%',

    // 阴影/光晕
    '--shadow-soft': '0 2px 8px hsl(180 30% 4% / 0.40)',
    '--shadow-elevated': '0 12px 32px hsl(180 30% 4% / 0.50)',
    '--highlight-glow': '0 0 0 3px hsl(174 65% 50% / 0.30)',
    '--status-success-glow': '152 60% 50% / 0.40',
    '--status-warning-glow': '38 88% 60% / 0.40',
    '--status-info-glow': '195 75% 60% / 0.40',
    '--status-error-glow': '0 65% 58% / 0.40',

    // 浮窗（墨翠主调，accent = 冷翠绿）
    '--overlay-bg': '180 16% 7%',
    '--overlay-text': '175 18% 92%',
    '--overlay-text-muted': '175 14% 60%',
    '--overlay-text-dim': '175 12% 40%',
    '--overlay-border': '175 18% 92% / 0.25',
    '--overlay-surface': '175 18% 92% / 0.06',
    '--overlay-accent': '174 65% 55%',
  },
  fonts: {
    body: '"PingFang SC", "Microsoft YaHei", "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif',
    mono: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
  },
}

export default qingLin