import type { ThemeDefinition } from './types'

/**
 * 棠梨 — 暖蜜桃（衬线主题）
 * 桃粉蜜橙，温柔手写感，唯一衬线主题
 */
const tangLi: ThemeDefinition = {
  id: 'tang-li',
  name: '棠梨',
  isDark: false,
  previewColors: {
    bg: '#fdf5f1',
    sidebar: '#fcebe1',
    primary: '#c25438',
    accent: '#fad8c8',
  },
  vars: {
    // 基础色
    '--background': '8 40% 98%',
    '--foreground': '12 28% 18%',
    '--card': '0 0% 100%',
    '--card-foreground': '12 28% 18%',
    '--primary': '8 65% 45%',
    '--primary-foreground': '0 0% 98%',
    '--secondary': '12 35% 92%',
    '--secondary-foreground': '12 28% 20%',
    '--muted': '12 28% 94%',
    '--muted-foreground': '12 15% 44%',
    '--accent': '8 55% 88%',
    '--accent-foreground': '8 65% 32%',
    '--destructive': '0 70% 52%',
    '--destructive-foreground': '0 0% 98%',
    '--border': '12 28% 86%',
    '--input': '12 28% 86%',
    '--ring': '8 65% 45%',
    '--radius': '0.75rem',

    // CTA
    '--cta': '8 70% 50%',
    '--cta-hover': '8 70% 44%',
    '--cta-foreground': '0 0% 100%',

    // 区域色
    '--sidebar-bg': '8 35% 96%',
    '--sidebar-border': '12 28% 86%',
    '--sidebar-item-active-bg': '8 50% 88%',
    '--sidebar-item-hover-bg': '12 35% 93%',
    '--sidebar-text': '12 15% 44%',
    '--sidebar-text-active': '8 65% 32%',
    '--titlebar-bg': '8 35% 96%',
    '--titlebar-text': '12 15% 44%',
    '--titlebar-close-hover-bg': '0 70% 52%',
    '--titlebar-close-hover-text': '0 0% 98%',

    // 表单
    '--input-bg': '0 0% 100%',
    '--input-border': '12 28% 84%',
    '--input-focus-border': '8 65% 45%',
    '--input-focus-ring': '8 65% 45%',
    '--input-placeholder': '12 12% 58%',

    // 状态色
    '--success': '142 55% 38%',
    '--success-foreground': '0 0% 100%',
    '--warning': '32 85% 50%',
    '--warning-foreground': '0 0% 100%',
    '--info': '200 70% 44%',
    '--info-foreground': '0 0% 100%',

    // primary 色阶（桃粉）
    '--primary-50': '8 60% 96%',
    '--primary-100': '8 62% 90%',
    '--primary-200': '8 64% 82%',
    '--primary-300': '8 65% 72%',
    '--primary-400': '8 65% 60%',
    '--primary-500': '8 65% 50%',
    '--primary-600': '8 65% 42%',
    '--primary-700': '8 60% 34%',
    '--primary-800': '8 55% 26%',
    '--primary-900': '8 50% 18%',

    // secondary 色阶（蜜橙）
    '--secondary-50': '12 35% 98%',
    '--secondary-100': '12 35% 95%',
    '--secondary-200': '12 35% 90%',
    '--secondary-300': '12 35% 82%',
    '--secondary-400': '12 32% 70%',
    '--secondary-500': '12 28% 56%',
    '--secondary-600': '12 25% 44%',
    '--secondary-700': '12 22% 32%',
    '--secondary-800': '12 18% 22%',
    '--secondary-900': '12 15% 14%',

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

    // 渐变（桃粉→蜜橙）
    '--gradient-from': '8 40% 98%',
    '--gradient-via': '15 30% 96%',
    '--gradient-to': '20 35% 97%',
    '--gradient-angle': '135deg',
    '--accent-gradient-from': '8 65% 50%',
    '--accent-gradient-to': '28 70% 58%',

    // 玻璃
    '--glass-bg': '12 28% 18% / 0.04',
    '--glass-border': '12 28% 18% / 0.08',
    '--glass-blur': '12px',
    '--glass-shadow': '0 4px 24px hsl(12 28% 18% / 0.06)',

    // 表面层级
    '--surface-1': '0 0% 100%',
    '--surface-2': '8 35% 95%',
    '--surface-3': '8 35% 92%',

    // 阴影/光晕
    '--shadow-soft': '0 2px 8px hsl(12 28% 18% / 0.05)',
    '--shadow-elevated': '0 12px 32px hsl(12 28% 18% / 0.10)',
    '--highlight-glow': '0 0 0 3px hsl(8 65% 45% / 0.20)',
    '--status-success-glow': '142 55% 38% / 0.30',
    '--status-warning-glow': '32 85% 50% / 0.30',
    '--status-info-glow': '200 70% 44% / 0.30',
    '--status-error-glow': '0 70% 52% / 0.30',

    // 浮窗（深桃粉主调，accent = 蜜桃）
    '--overlay-bg': '8 30% 10%',
    '--overlay-text': '8 18% 94%',
    '--overlay-text-muted': '8 14% 62%',
    '--overlay-text-dim': '8 12% 42%',
    '--overlay-border': '8 18% 92% / 0.25',
    '--overlay-surface': '8 18% 92% / 0.06',
    '--overlay-accent': '8 65% 60%',
  },
  fonts: {
    body: '"Source Han Serif SC", "Noto Serif SC", "Songti SC", "PingFang SC", "Microsoft YaHei", serif',
    mono: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
  },
}

export default tangLi