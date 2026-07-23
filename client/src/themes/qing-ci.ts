import type { ThemeDefinition } from './types'

/**
 * 青瓷 — 釉色温润（浅色主题）
 * 明式家具的简：低饱和青绿 + 米白釉面 + 棕褐黄铜点缀。
 * 不张扬，长时间使用不刺眼；CTA 用黄铜而非大红，保留克制感。
 */
const qingCi: ThemeDefinition = {
  id: 'qing-ci',
  name: '青瓷',
  isDark: false,
  previewColors: {
    bg: '#eef1ec',
    sidebar: '#e8ebe5',
    primary: '#5d8a7e',
    accent: '#8a6f47',
  },
  vars: {
    // 基础色 — 青瓷釉
    '--background': '165 18% 94%',
    '--foreground': '165 22% 16%',
    '--card': '165 24% 97%',
    '--card-foreground': '165 22% 18%',
    '--primary': '168 32% 38%',
    '--primary-foreground': '165 18% 96%',
    '--secondary': '165 14% 88%',
    '--secondary-foreground': '165 22% 18%',
    '--muted': '165 14% 90%',
    '--muted-foreground': '165 14% 38%',
    '--accent': '165 18% 86%',
    '--accent-foreground': '165 22% 18%',
    '--destructive': '14 58% 48%',
    '--destructive-foreground': '165 18% 96%',
    '--border': '165 18% 80%',
    '--input': '165 18% 80%',
    '--ring': '168 32% 38%',
    '--radius': '0.5rem',

    // CTA — 棕褐黄铜（明式家具铜件）
    '--cta': '32 38% 42%',
    '--cta-hover': '32 42% 48%',
    '--cta-foreground': '165 18% 96%',

    // 区域色
    '--sidebar-bg': '165 18% 92%',
    '--sidebar-border': '165 18% 78%',
    '--sidebar-item-active-bg': '168 32% 88%',
    '--sidebar-item-hover-bg': '165 16% 86%',
    '--sidebar-text': '165 18% 32%',
    '--sidebar-text-active': '168 32% 28%',
    '--titlebar-bg': '165 18% 91%',
    '--titlebar-text': '165 18% 32%',
    '--titlebar-close-hover-bg': '14 58% 48%',
    '--titlebar-close-hover-text': '165 18% 96%',

    // 表单
    '--input-bg': '165 24% 99%',
    '--input-border': '165 18% 76%',
    '--input-focus-border': '168 32% 38%',
    '--input-focus-ring': '168 32% 38%',
    '--input-placeholder': '165 14% 52%',

    // 状态色（拉低饱和与主调统一）
    '--success': '158 38% 38%',
    '--success-foreground': '165 18% 96%',
    '--warning': '36 65% 46%',
    '--warning-foreground': '165 18% 96%',
    '--info': '195 50% 44%',
    '--info-foreground': '165 18% 96%',

    // primary 色阶（青绿）
    '--primary-50': '168 28% 96%',
    '--primary-100': '168 30% 90%',
    '--primary-200': '168 32% 82%',
    '--primary-300': '168 32% 70%',
    '--primary-400': '168 32% 56%',
    '--primary-500': '168 32% 46%',
    '--primary-600': '168 32% 38%',
    '--primary-700': '168 30% 30%',
    '--primary-800': '168 28% 22%',
    '--primary-900': '168 26% 14%',

    // secondary 色阶（深灰青）
    '--secondary-50': '165 14% 96%',
    '--secondary-100': '165 14% 90%',
    '--secondary-200': '165 14% 80%',
    '--secondary-300': '165 14% 65%',
    '--secondary-400': '165 14% 50%',
    '--secondary-500': '165 14% 38%',
    '--secondary-600': '165 14% 28%',
    '--secondary-700': '165 14% 20%',
    '--secondary-800': '165 14% 14%',
    '--secondary-900': '165 14% 8%',

    // destructive 色阶（朱砂红但低饱和）
    '--destructive-50': '14 58% 96%',
    '--destructive-100': '14 58% 90%',
    '--destructive-200': '14 58% 80%',
    '--destructive-300': '14 58% 70%',
    '--destructive-400': '14 58% 60%',
    '--destructive-500': '14 58% 50%',
    '--destructive-600': '14 55% 42%',
    '--destructive-700': '14 50% 34%',
    '--destructive-800': '14 45% 26%',
    '--destructive-900': '14 40% 18%',

    // 渐变（釉色渐变）
    '--gradient-from': '165 18% 96%',
    '--gradient-via': '165 18% 94%',
    '--gradient-to': '168 16% 92%',
    '--gradient-angle': '150deg',
    '--accent-gradient-from': '168 32% 38%',
    '--accent-gradient-to': '32 38% 42%',

    // 玻璃
    '--glass-bg': '165 18% 99% / 0.55',
    '--glass-border': '165 22% 18% / 0.10',
    '--glass-blur': '12px',
    '--glass-shadow': '0 4px 24px hsl(165 22% 16% / 0.10)',

    // 表面层级
    '--surface-1': '165 24% 97%',
    '--surface-2': '165 18% 93%',
    '--surface-3': '165 16% 88%',

    // 阴影/光晕（明式家具的克制感）
    '--shadow-soft': '0 2px 8px hsl(165 22% 16% / 0.08)',
    '--shadow-elevated': '0 12px 32px hsl(165 22% 16% / 0.12)',
    '--highlight-glow': '0 0 0 3px hsl(168 32% 38% / 0.18)',
    '--status-success-glow': '158 38% 38% / 0.30',
    '--status-warning-glow': '36 65% 46% / 0.30',
    '--status-info-glow': '195 50% 44% / 0.30',
    '--status-error-glow': '14 58% 48% / 0.30',

    // 浮窗（深色釉面，对比强）
    '--overlay-bg': '165 30% 8%',
    '--overlay-text': '165 18% 94%',
    '--overlay-text-muted': '165 14% 62%',
    '--overlay-text-dim': '165 12% 42%',
    '--overlay-border': '165 18% 94% / 0.22',
    '--overlay-surface': '165 18% 94% / 0.06',
    '--overlay-accent': '168 32% 55%',
  },
  fonts: {
    body: '"PingFang SC", "Microsoft YaHei", "STSong", "Segoe UI", -apple-system, sans-serif',
    mono: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
  },
}

export default qingCi