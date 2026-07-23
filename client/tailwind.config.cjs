/** @type {import('tailwindcss').Config} */
const colorScale = buildColorScale()

module.exports = {
  darkMode: ["class"],
  content: ["./index.html", "./overlay.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          ...colorScale.primary,
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
          ...colorScale.secondary,
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          ...colorScale.destructive,
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // 区域色
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-bg))",
          border: "hsl(var(--sidebar-border))",
          "item-active": "hsl(var(--sidebar-item-active-bg))",
          "item-hover": "hsl(var(--sidebar-item-hover-bg))",
          text: "hsl(var(--sidebar-text))",
          "text-active": "hsl(var(--sidebar-text-active))",
        },
        titlebar: {
          DEFAULT: "hsl(var(--titlebar-bg))",
          text: "hsl(var(--titlebar-text))",
          "close-hover": "hsl(var(--titlebar-close-hover-bg))",
          "close-hover-text": "hsl(var(--titlebar-close-hover-text))",
        },
        // 表单控件色
        "input-bg": "hsl(var(--input-bg))",
        "input-border": "hsl(var(--input-border))",
        "input-focus-border": "hsl(var(--input-focus-border))",
        "input-focus-ring": "hsl(var(--input-focus-ring))",
        "input-placeholder": "hsl(var(--input-placeholder))",
        // 状态色
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        // CTA 强调色 — 亮宝蓝（用于 pill / 主操作）
        cta: {
          DEFAULT: "hsl(var(--cta))",
          hover: "hsl(var(--cta-hover))",
          foreground: "hsl(var(--cta-foreground))",
        },
        // 表面层级
        "surface-1": "hsl(var(--surface-1))",
        "surface-2": "hsl(var(--surface-2))",
        "surface-3": "hsl(var(--surface-3))",
      },
      // 色阶族（通过 spread 函数扩展 primary/secondary/destructive 的 50-900）
      // 字体栈 — 系统优先，不引 webfont
      //   sans: 微软雅黑 / 苹方（中文正文，控制/数字仍用此栈以保持对齐）
      //   serif: 思源宋体 / 宋体（中文标题/正文，宋体字韵）
      fontFamily: {
        sans: [
          '"PingFang SC"',
          '"Microsoft YaHei"',
          '"Hiragino Sans GB"',
          '"Segoe UI"',
          '-apple-system',
          'BlinkMacSystemFont',
          'Roboto',
          'sans-serif',
        ],
        serif: [
          '"Source Han Serif SC"',
          '"Noto Serif CJK SC"',
          '"Songti SC"',
          'SimSun',
          'STSong',
          'STKaiti',
          'serif',
        ],
        mono: [
          '"JetBrains Mono"',
          '"SF Mono"',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      // 中文字距：中文字符本身方正，「疏」靠 tracking-wide / tracking-wider
      letterSpacing: {
        'cn-tight': '-0.01em',
        'cn-normal': '0',
        'cn-wide': '0.05em',
        'cn-wider': '0.1em',
      },
      // 中文行高：明式家具留白，行高比英文大
      lineHeight: {
        'cn-snug': '1.55',
        'cn-normal': '1.75',
        'cn-loose': '2',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "3xl": "calc(var(--radius) + 12px)",
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        elevated: "var(--shadow-elevated)",
        glow: "0 0 24px var(--highlight-glow)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

/** 构建 primary/secondary/destructive 的 10 阶色阶族
 * 注意：会覆盖 theme.extend.colors 中已有的 primary/secondary/destructive 对象，
 * 但保留 DEFAULT 和 foreground 键，仅添加 50-900 子键。
 */
function buildColorScale() {
  const build = (prefix) => {
    const scale = {}
    for (const level of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
      scale[level] = `hsl(var(--${prefix}-${level}))`
    }
    return scale
  }
  // 注意：Tailwind extend 模式下，相同 key 会深合并。
  // 但因为我们已经把 primary/secondary/destructive 定义为对象（带 DEFAULT/foreground），
  // 直接返回 { primary: scale, ... } 会覆盖整个对象。这里改用合并策略：
  const result = {}
  for (const name of ['primary', 'secondary', 'destructive']) {
    result[name] = build(name)
  }
  return result
}
