# 中国风 UI 改造方案 — 明式简 + 青瓷釉

## 设计原则（用户决策）

1. **简**：明式家具「去装饰而留气韵」，不堆元素
2. **青瓷雅致**：低饱和青绿 + 米白 + 棕褐，点缀少量金
3. **回纹点缀**：仅出现在 3 个最关键的视觉点，不滥用
4. **保留 lucide 图标**：不替换工具图标，避免割裂
5. **不引入 webfont**：避免打包膨胀；继续用系统 `PingFang SC / Microsoft YaHei`
6. **不改交互逻辑**：只改视觉骨架

---

## 改造范围（按「点睛不过三」原则，仅 4 处）

| # | 位置 | 改动 | 强度 |
|---|---|---|---|
| 1 | **新增 `qing-ci`（青瓷）主题** | 复用现有 7 主题架构，加 1 个主题文件 | 🟢 主调 |
| 2 | **侧栏顶部印章 Logo** | 在 Sidebar 顶部加 1 个中式印章 SVG（朱红/青瓷色回纹边） | 🟢 点睛 |
| 3 | **回纹分隔线组件** | 新增 `KeyDivider.tsx`，替代页面内 8 处 `border-t` | 🟢 骨架 |
| 4 | **EmptyState 加水墨占位** | 扩展 EmptyState 支持 `pattern="ink"` prop，加 1 个 inline SVG | 🟢 气质 |

**不在范围内**：
- ❌ 改主题字体 / 引入 webfont
- ❌ 改 PageSection / Button / Card 内部样式
- ❌ 改 Welcome / RecordingOrb 等大件
- ❌ 改其它主题（`qing-lin` / `ye-lan` 等保留原样）

---

## 详细设计

### 改动 1：新增 `qing-ci`（青瓷）主题

**新文件**：`client/src/themes/qing-ci.ts`（~160 行，参照 `qing-lin.ts`）

**调色板**（HSL）：
```
--background      青瓷釉白  165 18% 95%
--foreground      茶绿墨    165 22% 18%
--card            釉面      165 22% 98%
--card-foreground 165 22% 22%
--primary         青瓷主    168 38% 42%   (低饱和青绿)
--primary-foreground 釉白    165 18% 96%
--accent          釉色浅    165 18% 88%
--muted           哑光      165 12% 92%
--muted-foreground 茶灰      165 14% 42%
--border          釉裂纹    165 18% 82%
--ring            168 38% 42%
--radius          0.5rem           (明式硬朗，圆角收紧)
--cta             棕褐黄铜  32 38% 45%
--cta-hover       32 42% 52%
--cta-foreground  165 18% 96%

// 状态色 — 拉低饱和，与主调统一
--success         158 40% 42%
--warning         36 65% 50%
--info            195 50% 48%
--destructive     18 60% 50%

// 色阶 (10 阶)
--primary-50  ~ primary-900: 青绿渐变

// 浮窗（深色，对比强）
--overlay-bg    165 30% 8%
--overlay-accent 168 38% 55%
```

**注册**：
- `client/src/themes/index.ts` —— `import qingCi`、`themes['qing-ci'] = qingCi`、`themeList` 中插入
- `client/src/themes/types.ts` —— `ThemeId` 联合加 `'qing-ci'`
- `client/src/stores/theme.ts` —— **不**改默认（保持 `ye-lan` 默认，用户手动切换）

**视觉效果**：
```
背景：温润米青，护眼
卡片：纯白带釉光
主色：温润青瓷（点睛不刺眼）
强调：棕褐黄铜（按 CTA / 重要徽章）
边框：青瓷裂纹色（取代死板灰边）
```

### 改动 2：印章 Logo 组件 + Sidebar 接入

**新文件**：`client/src/components/Seal.tsx`（~50 行）

**SVG 设计**（12 行内，inline）：
- 60×60 viewBox，外圆角矩形 6px radius
- 描边 1.5px 青瓷色（`currentColor`，继承主题 primary）
- 中央 **回字纹**（最简版：2 圈嵌套方框 + 4 角缺口）
- 文字「说」或「錄」居中（黑体 / 系统字体）
- 可选 `tone="primary" | "vermilion"` —— vermilion 给赤陶/红系主题用

```tsx
interface SealProps {
  size?: number        // 默认 32
  tone?: 'primary' | 'vermilion'
  className?: string
}
```

**接入 Sidebar**：`client/src/components/Sidebar.tsx`
- 第 117 行 `<nav>` 之前插入：
  ```tsx
  <div className="flex items-center gap-2 px-4 py-4">
    <Seal size={28} />
    <span className="text-sm font-semibold tracking-wide">说 · 录</span>
  </div>
  <div className="mx-3 h-px bg-sidebar-border/60" />  // 分隔线
  ```
- 当切到非中式主题时，可用 CSS 类 `.theme-ye-lan .seal-brand` 隐藏（只在中式主题显示）

**取舍**：先**全主题都显示**（印章是品牌而非装饰），保持简单；后续如要主题感知再调整。

### 改动 3：回纹分隔线组件

**新文件**：`client/src/components/ui/KeyDivider.tsx`（~30 行）

**API**：
```tsx
interface KeyDividerProps {
  /** 回纹重复次数，默认 6 */
  repeats?: number
  className?: string
  /** 回纹色，默认 currentColor */
  color?: string
}
```

**SVG 设计**（核心 = 一个回纹单元）：
- 单个回纹单元 16×8 viewBox，2 个并排方框 + 2 个缺口
- 通过 `<pattern>` 平铺，宽度自动 repeat
- 整体高度 8px，极细（不喧宾夺主）

```tsx
export default function KeyDivider({ repeats = 6, className, color = 'currentColor' }: KeyDividerProps) {
  return (
    <div className={cn('flex h-2 items-center opacity-40', className)}>
      <svg width="100%" height="8" preserveAspectRatio="xMinYMid meet">
        <defs>
          <pattern id="key-pattern" width="16" height="8" patternUnits="userSpaceOnUse">
            <path d="M0 0 H6 V8 H0 Z M10 0 H16 V8 H10 Z M6 2 H10 V6 H6 Z" 
                  fill="none" stroke={color} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="8" fill="url(#key-pattern)" />
      </svg>
    </div>
  )
}
```

**接入**：暂**不强制替换**现有 8 处 `border-t`，而是先在 **Home.tsx**（用户主入口）试用 1 次，证明效果后用户决定要不要继续替换。

→ 改动 3 = **只加组件，不改用法**（最低风险）

### 改动 4：EmptyState 加 `ink` 占位

**改文件**：`client/src/components/ui/EmptyState.tsx`

**Props 扩展**：
```tsx
interface EmptyStateProps {
  title: string
  description?: string
  icon?: React.ReactNode
  /** 'classic' = 仅 icon；'ink' = 墨点占位 + icon */
  variant?: 'classic' | 'ink'
  action?: React.ReactNode
  className?: string
}
```

**ink 模式视觉**（inline SVG，~15 行）：
- 直径 80px 圆形
- 中央 1 个不规则墨点（贝塞尔曲线，3 个 S 弯）
- 周围 3-4 个小墨点（直径 4-8px），随机偏移
- 颜色用主题 `--muted-foreground`，opacity 0.3
- icon 浮在墨点之上

**接入**：暂不改现有调用点（保留默认 `classic`）。后续如有用户反馈再替换。

→ 改动 4 = **只加 variant prop，不改用法**（最低风险）

---

## 文件清单

### 新增（4 个文件）
1. `client/src/themes/qing-ci.ts` —— 青瓷主题（~160 行）
2. `client/src/components/Seal.tsx` —— 印章 Logo（~50 行）
3. `client/src/components/ui/KeyDivider.tsx` —— 回纹分隔线（~30 行）

### 修改（3 个文件）
4. `client/src/themes/index.ts` —— 注册 `qing-ci`（+3 行）
5. `client/src/themes/types.ts` —— `ThemeId` 加 `'qing-ci'`（+1 行）
6. `client/src/components/Sidebar.tsx` —— 顶部加 Seal + 名称（+5 行）
7. `client/src/components/ui/EmptyState.tsx` —— 加 `variant: 'ink'` prop（+25 行）

**总计**：3 新 + 4 改 ≈ **~270 行**

---

## 验收

- ✅ `npx tsc --noEmit` 0 错误
- ✅ `npx vitest run` 无回归（既有 147 测试）
- ✅ `npx tauri build` 成功
- ✅ AppearancePage 主题列表出现「青瓷」选项（自动通过 `themeList` 注册）
- ✅ 切换到「青瓷」主题后：
  - 整体呈温润米青
  - 侧栏顶部出现印章 + 「说 · 录」字样
  - CTA 按钮呈棕褐黄铜色
- ✅ 切换回原主题（如夜岚 / 武松），印章仍然显示（印章是品牌）
- ✅ `KeyDivider` / `EmptyState.variant='ink'` 已就绪，但本次未在生产路径使用（**最低风险**）

---

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 印章 SVG 在小尺寸下锯齿 | `vector-effect="non-scaling-stroke"` + size=28 |
| 回纹 SVG 在低端机掉帧 | 用 `<pattern>` + 静态 SVG（不动画） |
| `qing-ci` 与 `qing-lin`（青林）名称混淆 | UI 显示「青瓷」vs「青林」，名称区分清晰 |
| EmptyState 扩展 prop 影响现有调用 | `variant` 默认为 `'classic'`，现有调用全部走原逻辑 |
| Sidebar 加 Seal 后太挤 | Seal 28px + 字 14px，仅占 60px 高度，远小于原 12px py |

---

## 后续可选项（本次不做，等用户反馈）

- 用 `KeyDivider` 替换 8 处 `border-t`
- 在 Home.tsx 的 Hero 区下方加 1 个回纹分隔
- Welcome 页加水墨背景
- RecordingOrb 边缘加回纹框
- 把 `qing-ci` 设为默认主题

---

## 工作量

**预估 30 分钟**（3 个新组件 + 1 个主题文件 + 4 处接入）

## 打包

完成 → 重新 `npx tauri build` → v4 安装包