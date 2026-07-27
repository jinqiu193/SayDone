import type { ThemeDefinition } from './types'

/**
 * 赤陶 — 暖橘
 * 杏黄淡赭，手作陶器般的温度
 */
const chiTao: ThemeDefinition = {
  id: 'chi-tao',
  name: '赤陶',
  isDark: false,
  previewColors: {
    bg: '#fbf6f0',
    sidebar: '#f7ede0',
    primary: '#a64b1f',
    accent: '#f5e3d0',
  },
  vars: {
    // 基础色
    '--background': '28 35% 97%',
    '--foreground': '22 30% 16%',
    '--card': '0 0% 100%',
    '--card-foreground': '22 30% 16%',
    '--primary': '22 75% 38%',
    '--primary-foreground': '0 0% 98%',
    '--secondary': '28 30% 90%',
    '--secondary-foreground': '22 30% 18%',
    '--muted': '28 25% 92%',
    '--muted-foreground': '22 18% 42%',
    '--accent': '22 50% 86%',
    '--accent-foreground': '22 75% 28%',
    '--destructive': '0 70% 50%',
    '--destructive-foreground': '0 0% 98%',
    '--border': '28 25% 84%',
    '--input': '28 25% 84%',
    '--ring': '22 75% 38%',
    '--radius': '0.75rem',

    // CTA
    '--cta': '22 80% 42%',
    '--cta-hover': '22 80% 36%',
    '--cta-foreground': '0 0% 100%',

    // 区域色
    '--sidebar-bg': '28 32% 95%',
    '--sidebar-border': '28 25% 84%',
    '--sidebar-item-active-bg': '22 45% 86%',
    '--sidebar-item-hover-bg': '28 30% 92%',
    '--sidebar-text': '22 18% 42%',
    '--sidebar-text-active': '22 75% 28%',
    '--titlebar-bg': '28 32% 95%',
    '--titlebar-text': '22 18% 42%',
    '--titlebar-close-hover-bg': '0 70% 50%',
    '--titlebar-close-hover-text': '0 0% 98%',

    // 表单
    '--input-bg': '0 0% 100%',
    '--input-border': '28 25% 82%',
    '--input-focus-border': '22 75% 38%',
    '--input-focus-ring': '22 75% 38%',
    '--input-placeholder': '22 15% 58%',

    // 状态色
    '--success': '142 60% 36%',
    '--success-foreground': '0 0% 100%',
    '--warning': '32 88% 48%',
    '--warning-foreground': '0 0% 100%',
    '--info': '200 75% 42%',
    '--info-foreground': '0 0% 100%',

    // primary 色阶（赤陶橘）
    '--primary-50': '22 70% 96%',
    '--primary-100': '22 72% 90%',
    '--primary-200': '22 74% 82%',
    '--primary-300': '22 75% 70%',
    '--primary-400': '22 75% 58%',
    '--primary-500': '22 75% 46%',
    '--primary-600': '22 75% 38%',
    '--primary-700': '22 70% 30%',
    '--primary-800': '22 65% 22%',
    '--primary-900': '22 60% 14%',

    // secondary 色阶（米杏）
    '--secondary-50': '28 30% 98%',
    '--secondary-100': '28 30% 95%',
    '--secondary-200': '28 30% 90%',
    '--secondary-300': '28 30% 82%',
    '--secondary-400': '28 28% 70%',
    '--secondary-500': '28 25% 56%',
    '--secondary-600': '28 22% 44%',
    '--secondary-700': '28 20% 32%',
    '--secondary-800': '28 18% 22%',
    '--secondary-900': '28 16% 14%',

    // destructive 色阶
    '--destructive-50': '0 70% 97%',
    '--destructive-100': '0 70% 93%',
    '--destructive-200': '0 70% 86%',
    '--destructive-300': '0 70% 76%',
    '--destructive-400': '0 70% 64%',
    '--destructive-500': '0 70% 54%',
    '--destructive-600': '0 65% 44%',
    '--destructive-700': '0 60% 36%',
    '--destructive-800': '0 55% 28%',
    '--destructive-900': '0 50% 20%',

    // 渐变（杏黄→淡赭）
    '--gradient-from': '28 35% 97%',
    '--gradient-via': '22 30% 95%',
    '--gradient-to': '18 35% 96%',
    '--gradient-angle': '135deg',
    '--accent-gradient-from': '22 75% 46%',
    '--accent-gradient-to': '8 70% 55%',

    // 玻璃
    '--glass-bg': '22 30% 16% / 0.04',
    '--glass-border': '22 30% 16% / 0.08',
    '--glass-blur': '12px',
    '--glass-shadow': '0 4px 24px hsl(22 30% 16% / 0.06)',

    // 表面层级
    '--surface-1': '0 0% 100%',
    '--surface-2': '28 30% 95%',
    '--surface-3': '28 30% 92%',

    // 阴影/光晕
    '--shadow-soft': '0 2px 8px hsl(22 30% 16% / 0.05)',
    '--shadow-elevated': '0 12px 32px hsl(22 30% 16% / 0.10)',
    '--highlight-glow': '0 0 0 3px hsl(22 75% 38% / 0.20)',
    '--status-success-glow': '142 60% 36% / 0.30',
    '--status-warning-glow': '32 88% 48% / 0.30',
    '--status-info-glow': '200 75% 42% / 0.30',
    '--status-error-glow': '0 70% 50% / 0.30',

    // 浮窗（深棕主调，accent = 赤陶橘）
    '--overlay-bg': '22 35% 8%',
    '--overlay-text': '28 18% 94%',
    '--overlay-text-muted': '22 14% 62%',
    '--overlay-text-dim': '22 12% 42%',
    '--overlay-border': '28 18% 92% / 0.25',
    '--overlay-surface': '28 18% 92% / 0.06',
    '--overlay-accent': '22 75% 55%',
  },
  fonts: {
    body: '"PingFang SC", "Microsoft YaHei", "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif',
    mono: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
  },
}

export default chiTao