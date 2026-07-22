import type { ThemeDefinition } from './types'

/**
 * 寒山 — 中性极简（替代旧 light）
 * 干净的无色调设计，shadcn 经典风格
 */
const hanShan: ThemeDefinition = {
  id: 'han-shan',
  name: '寒山',
  isDark: false,
  previewColors: {
    bg: '#ffffff',
    sidebar: '#ffffff',
    primary: '#18181b',
    accent: '#f4f4f5',
  },
  vars: {
    // 基础色
    '--background': '0 0% 100%',
    '--foreground': '240 10% 3.9%',
    '--card': '0 0% 100%',
    '--card-foreground': '240 10% 3.9%',
    '--primary': '240 5.9% 10%',
    '--primary-foreground': '0 0% 98%',
    '--secondary': '240 4.8% 95.9%',
    '--secondary-foreground': '240 5.9% 10%',
    '--muted': '240 4.8% 95.9%',
    '--muted-foreground': '240 3.8% 46.1%',
    '--accent': '240 4.8% 95.9%',
    '--accent-foreground': '240 5.9% 10%',
    '--destructive': '0 84.2% 60.2%',
    '--destructive-foreground': '0 0% 98%',
    '--border': '240 5.9% 90%',
    '--input': '240 5.9% 90%',
    '--ring': '240 5.9% 10%',
    '--radius': '0.75rem',

    // CTA
    '--cta': '217 91% 60%',
    '--cta-hover': '217 91% 53%',
    '--cta-foreground': '0 0% 100%',

    // 区域色
    '--sidebar-bg': '0 0% 100%',
    '--sidebar-border': '240 5.9% 90%',
    '--sidebar-item-active-bg': '240 4.8% 95.9%',
    '--sidebar-item-hover-bg': '240 4.8% 97.9%',
    '--sidebar-text': '240 4% 46%',
    '--sidebar-text-active': '240 10% 3.9%',
    '--titlebar-bg': '0 0% 100%',
    '--titlebar-text': '240 4% 46%',
    '--titlebar-close-hover-bg': '0 84.2% 60.2%',
    '--titlebar-close-hover-text': '0 0% 100%',

    // 表单
    '--input-bg': '0 0% 100%',
    '--input-border': '240 5.9% 90%',
    '--input-focus-border': '240 5.9% 10%',
    '--input-focus-ring': '240 5.9% 10%',
    '--input-placeholder': '240 4% 65%',

    // 状态色
    '--success': '142 76% 36%',
    '--success-foreground': '0 0% 100%',
    '--warning': '38 92% 50%',
    '--warning-foreground': '0 0% 100%',
    '--info': '199 89% 48%',
    '--info-foreground': '0 0% 100%',

    // primary 色阶（中性黑）
    '--primary-50': '240 5% 96%',
    '--primary-100': '240 5% 92%',
    '--primary-200': '240 5% 84%',
    '--primary-300': '240 5% 70%',
    '--primary-400': '240 5% 50%',
    '--primary-500': '240 6% 30%',
    '--primary-600': '240 6% 20%',
    '--primary-700': '240 6% 14%',
    '--primary-800': '240 6% 10%',
    '--primary-900': '240 10% 4%',

    // secondary 色阶
    '--secondary-50': '240 5% 98%',
    '--secondary-100': '240 5% 96%',
    '--secondary-200': '240 5% 92%',
    '--secondary-300': '240 5% 86%',
    '--secondary-400': '240 5% 76%',
    '--secondary-500': '240 5% 64%',
    '--secondary-600': '240 5% 50%',
    '--secondary-700': '240 5% 36%',
    '--secondary-800': '240 5% 24%',
    '--secondary-900': '240 5% 14%',

    // destructive 色阶
    '--destructive-50': '0 86% 97%',
    '--destructive-100': '0 86% 94%',
    '--destructive-200': '0 85% 88%',
    '--destructive-300': '0 84% 78%',
    '--destructive-400': '0 84% 68%',
    '--destructive-500': '0 84% 60%',
    '--destructive-600': '0 73% 52%',
    '--destructive-700': '0 70% 42%',
    '--destructive-800': '0 65% 34%',
    '--destructive-900': '0 60% 26%',

    // 渐变系统（极淡冷灰）
    '--gradient-from': '220 20% 99%',
    '--gradient-via': '220 15% 97%',
    '--gradient-to': '220 25% 96%',
    '--gradient-angle': '135deg',
    '--accent-gradient-from': '217 91% 60%',
    '--accent-gradient-to': '230 85% 65%',

    // 玻璃
    '--glass-bg': '240 10% 4% / 0.04',
    '--glass-border': '240 10% 4% / 0.08',
    '--glass-blur': '12px',
    '--glass-shadow': '0 4px 24px hsl(240 10% 4% / 0.06)',

    // 表面层级
    '--surface-1': '0 0% 100%',
    '--surface-2': '240 4.8% 97%',
    '--surface-3': '240 4.8% 94%',

    // 阴影/光晕
    '--shadow-soft': '0 2px 8px hsl(240 10% 4% / 0.05)',
    '--shadow-elevated': '0 12px 32px hsl(240 10% 4% / 0.10)',
    '--highlight-glow': '0 0 0 3px hsl(217 91% 60% / 0.20)',
    '--status-success-glow': '142 76% 36% / 0.30',
    '--status-warning-glow': '38 92% 50% / 0.30',
    '--status-info-glow': '199 89% 48% / 0.30',
    '--status-error-glow': '0 84% 60% / 0.30',

    // 浮窗（中性极简，浅色主题使用白色浮窗；accent 仍取主色 = 黑）
    '--overlay-bg': '0 0% 100%',
    '--overlay-text': '240 10% 8%',
    '--overlay-text-muted': '240 6% 32%',
    '--overlay-text-dim': '240 5% 50%',
    '--overlay-border': '240 6% 90% / 0.85',
    '--overlay-surface': '240 6% 92% / 0.55',
    '--overlay-accent': '240 5.9% 14%',
  },
  fonts: {
    body: '"PingFang SC", "Microsoft YaHei", "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif',
    mono: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
  },
}

export default hanShan