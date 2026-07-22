import type { ThemeDefinition } from './types'

/**
 * 夜岚 — 深海蓝（替代旧 dark）
 * 深邃静谧，蓝紫相间
 */
const yeLan: ThemeDefinition = {
  id: 'ye-lan',
  name: '夜岚',
  isDark: true,
  previewColors: {
    bg: '#14171f',
    sidebar: '#1a1f2b',
    primary: '#6b9eff',
    accent: '#2a3142',
  },
  vars: {
    // 基础色
    '--background': '222 20% 9%',
    '--foreground': '210 25% 92%',
    '--card': '222 22% 12%',
    '--card-foreground': '210 25% 92%',
    '--primary': '215 75% 65%',
    '--primary-foreground': '222 30% 8%',
    '--secondary': '222 18% 18%',
    '--secondary-foreground': '210 25% 92%',
    '--muted': '222 18% 16%',
    '--muted-foreground': '215 15% 65%',
    '--accent': '222 22% 22%',
    '--accent-foreground': '210 25% 92%',
    '--destructive': '0 70% 58%',
    '--destructive-foreground': '210 25% 98%',
    '--border': '222 18% 22%',
    '--input': '222 18% 22%',
    '--ring': '215 75% 65%',
    '--radius': '0.75rem',

    // CTA
    '--cta': '217 91% 65%',
    '--cta-hover': '217 91% 70%',
    '--cta-foreground': '222 30% 8%',

    // 区域色
    '--sidebar-bg': '222 25% 11%',
    '--sidebar-border': '222 18% 22%',
    '--sidebar-item-active-bg': '215 50% 28%',
    '--sidebar-item-hover-bg': '222 22% 18%',
    '--sidebar-text': '215 15% 65%',
    '--sidebar-text-active': '210 25% 96%',
    '--titlebar-bg': '222 25% 10%',
    '--titlebar-text': '215 15% 65%',
    '--titlebar-close-hover-bg': '0 70% 58%',
    '--titlebar-close-hover-text': '210 25% 98%',

    // 表单
    '--input-bg': '222 22% 14%',
    '--input-border': '222 18% 24%',
    '--input-focus-border': '215 75% 65%',
    '--input-focus-ring': '215 75% 65%',
    '--input-placeholder': '215 12% 50%',

    // 状态色
    '--success': '142 65% 50%',
    '--success-foreground': '222 30% 8%',
    '--warning': '38 90% 60%',
    '--warning-foreground': '222 30% 8%',
    '--info': '199 80% 60%',
    '--info-foreground': '222 30% 8%',

    // primary 色阶（深海蓝）
    '--primary-50': '215 60% 96%',
    '--primary-100': '215 65% 90%',
    '--primary-200': '215 70% 82%',
    '--primary-300': '215 72% 75%',
    '--primary-400': '215 75% 68%',
    '--primary-500': '215 75% 60%',
    '--primary-600': '215 75% 50%',
    '--primary-700': '215 70% 40%',
    '--primary-800': '215 65% 30%',
    '--primary-900': '215 60% 20%',

    // secondary 色阶（深灰）
    '--secondary-50': '222 18% 96%',
    '--secondary-100': '222 18% 90%',
    '--secondary-200': '222 18% 80%',
    '--secondary-300': '222 18% 65%',
    '--secondary-400': '222 18% 50%',
    '--secondary-500': '222 18% 35%',
    '--secondary-600': '222 18% 25%',
    '--secondary-700': '222 18% 18%',
    '--secondary-800': '222 18% 12%',
    '--secondary-900': '222 18% 8%',

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

    // 渐变（深邃蓝→紫）
    '--gradient-from': '220 30% 8%',
    '--gradient-via': '235 25% 10%',
    '--gradient-to': '255 20% 8%',
    '--gradient-angle': '160deg',
    '--accent-gradient-from': '215 75% 60%',
    '--accent-gradient-to': '250 70% 65%',

    // 玻璃
    '--glass-bg': '210 25% 92% / 0.06',
    '--glass-border': '210 25% 92% / 0.10',
    '--glass-blur': '12px',
    '--glass-shadow': '0 4px 24px hsl(222 30% 4% / 0.30)',

    // 表面层级
    '--surface-1': '222 22% 12%',
    '--surface-2': '222 22% 16%',
    '--surface-3': '222 22% 20%',

    // 阴影/光晕
    '--shadow-soft': '0 2px 8px hsl(222 30% 4% / 0.40)',
    '--shadow-elevated': '0 12px 32px hsl(222 30% 4% / 0.50)',
    '--highlight-glow': '0 0 0 3px hsl(217 91% 65% / 0.30)',
    '--status-success-glow': '142 65% 50% / 0.40',
    '--status-warning-glow': '38 90% 60% / 0.40',
    '--status-info-glow': '199 80% 60% / 0.40',
    '--status-error-glow': '0 70% 58% / 0.40',

    // 浮窗（深海蓝主调，accent 取主色 = 深海蓝）
    '--overlay-bg': '220 30% 6%',
    '--overlay-text': '210 25% 96%',
    '--overlay-text-muted': '215 15% 65%',
    '--overlay-text-dim': '215 12% 45%',
    '--overlay-border': '210 25% 92% / 0.25',
    '--overlay-surface': '210 25% 92% / 0.06',
    '--overlay-accent': '215 75% 65%',
  },
  fonts: {
    body: '"PingFang SC", "Microsoft YaHei", "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif',
    mono: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
  },
}

export default yeLan