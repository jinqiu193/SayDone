import type { ThemeDefinition } from './types'

/**
 * 雾松 — 冷青蓝（基于旧 teal 冷化）
 * 清澈冷冽，雾青与淡蓝交织
 */
const wuSong: ThemeDefinition = {
  id: 'wu-song',
  name: '雾松',
  isDark: false,
  previewColors: {
    bg: '#f4f8fa',
    sidebar: '#f0f6f8',
    primary: '#0d7a72',
    accent: '#dceff0',
  },
  vars: {
    // 基础色
    '--background': '195 30% 97%',
    '--foreground': '195 30% 12%',
    '--card': '0 0% 100%',
    '--card-foreground': '195 30% 12%',
    '--primary': '185 75% 28%',
    '--primary-foreground': '0 0% 98%',
    '--secondary': '190 30% 92%',
    '--secondary-foreground': '195 30% 18%',
    '--muted': '190 25% 93%',
    '--muted-foreground': '195 15% 42%',
    '--accent': '185 35% 88%',
    '--accent-foreground': '185 75% 22%',
    '--destructive': '0 75% 55%',
    '--destructive-foreground': '0 0% 98%',
    '--border': '195 25% 86%',
    '--input': '195 25% 86%',
    '--ring': '185 75% 28%',
    '--radius': '0.75rem',

    // CTA
    '--cta': '195 80% 38%',
    '--cta-hover': '195 80% 32%',
    '--cta-foreground': '0 0% 100%',

    // 区域色
    '--sidebar-bg': '195 28% 95%',
    '--sidebar-border': '195 25% 86%',
    '--sidebar-item-active-bg': '185 40% 88%',
    '--sidebar-item-hover-bg': '190 30% 92%',
    '--sidebar-text': '195 18% 42%',
    '--sidebar-text-active': '185 75% 22%',
    '--titlebar-bg': '195 28% 95%',
    '--titlebar-text': '195 18% 42%',
    '--titlebar-close-hover-bg': '0 75% 55%',
    '--titlebar-close-hover-text': '0 0% 98%',

    // 表单
    '--input-bg': '0 0% 100%',
    '--input-border': '195 25% 84%',
    '--input-focus-border': '185 75% 28%',
    '--input-focus-ring': '185 75% 28%',
    '--input-placeholder': '195 15% 60%',

    // 状态色
    '--success': '152 65% 35%',
    '--success-foreground': '0 0% 100%',
    '--warning': '32 88% 48%',
    '--warning-foreground': '0 0% 100%',
    '--info': '200 80% 42%',
    '--info-foreground': '0 0% 100%',

    // primary 色阶（青绿）
    '--primary-50': '185 60% 96%',
    '--primary-100': '185 65% 90%',
    '--primary-200': '185 70% 80%',
    '--primary-300': '185 75% 65%',
    '--primary-400': '185 75% 50%',
    '--primary-500': '185 75% 38%',
    '--primary-600': '185 75% 30%',
    '--primary-700': '185 75% 24%',
    '--primary-800': '185 70% 18%',
    '--primary-900': '185 65% 12%',

    // secondary 色阶（雾青）
    '--secondary-50': '190 30% 98%',
    '--secondary-100': '190 30% 95%',
    '--secondary-200': '190 30% 90%',
    '--secondary-300': '190 30% 82%',
    '--secondary-400': '190 28% 70%',
    '--secondary-500': '190 25% 58%',
    '--secondary-600': '190 22% 46%',
    '--secondary-700': '190 20% 34%',
    '--secondary-800': '190 18% 22%',
    '--secondary-900': '190 16% 14%',

    // destructive 色阶
    '--destructive-50': '0 75% 97%',
    '--destructive-100': '0 75% 94%',
    '--destructive-200': '0 75% 88%',
    '--destructive-300': '0 75% 78%',
    '--destructive-400': '0 75% 68%',
    '--destructive-500': '0 75% 58%',
    '--destructive-600': '0 70% 48%',
    '--destructive-700': '0 65% 38%',
    '--destructive-800': '0 60% 30%',
    '--destructive-900': '0 55% 22%',

    // 渐变（雾青→淡蓝）
    '--gradient-from': '195 30% 97%',
    '--gradient-via': '190 25% 95%',
    '--gradient-to': '200 30% 95%',
    '--gradient-angle': '135deg',
    '--accent-gradient-from': '185 75% 38%',
    '--accent-gradient-to': '210 70% 55%',

    // 玻璃
    '--glass-bg': '195 30% 12% / 0.04',
    '--glass-border': '195 30% 12% / 0.08',
    '--glass-blur': '12px',
    '--glass-shadow': '0 4px 24px hsl(195 30% 12% / 0.06)',

    // 表面层级
    '--surface-1': '0 0% 100%',
    '--surface-2': '195 28% 95%',
    '--surface-3': '195 28% 92%',

    // 阴影/光晕
    '--shadow-soft': '0 2px 8px hsl(195 30% 12% / 0.05)',
    '--shadow-elevated': '0 12px 32px hsl(195 30% 12% / 0.10)',
    '--highlight-glow': '0 0 0 3px hsl(185 75% 28% / 0.20)',
    '--status-success-glow': '152 65% 35% / 0.30',
    '--status-warning-glow': '32 88% 48% / 0.30',
    '--status-info-glow': '200 80% 42% / 0.30',
    '--status-error-glow': '0 75% 55% / 0.30',

    // 浮窗（深青主调，accent = 青绿）
    '--overlay-bg': '195 30% 8%',
    '--overlay-text': '195 18% 94%',
    '--overlay-text-muted': '195 14% 62%',
    '--overlay-text-dim': '195 12% 42%',
    '--overlay-border': '195 18% 92% / 0.25',
    '--overlay-surface': '195 18% 92% / 0.06',
    '--overlay-accent': '185 75% 50%',
  },
  fonts: {
    body: '"PingFang SC", "Microsoft YaHei", "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif',
    mono: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
  },
}

export default wuSong