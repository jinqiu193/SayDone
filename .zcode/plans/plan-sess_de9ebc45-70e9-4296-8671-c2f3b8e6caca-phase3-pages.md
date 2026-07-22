# Phase 3 — 8 个页面"高效"优化方案

**用户原话**：
> "我们是一个语音输入法软件，我们第一个就是高效，高效还是他妈的高效！比如现在的工作台，你放一个统计数据，这他妈的有什么用吗？"

**核心原则**：
- 高效 = "打开应用 → 看到按键 → 按下 → 说话 → 文字到位" ≤ 3 秒
- **配置页所有字段实时保存**，删除"保存/测试"按钮
- 首页/工作台只保留**用户当下需要的 1-2 个信息**
- 删除统计卡片、装饰性 UI、对核心操作无帮助的步骤

---

## 总览：8 页 + 1 Sidebar 改动矩阵

| 页面 | 当前最大问题 | 改动量 | 风险 |
|---|---|---|---|
| **1. 工作台** | 4 张统计卡片 + FeedbackSection 占满首屏 | **M** 重写首屏 | 低 |
| **2. 历史记录** | 分页按钮 + 搜索 300ms 防抖 | S 微调 | 低 |
| **3. 会议纪要** | 几乎合理 | S 微调状态文案 | 低 |
| **4. 知识库** | 状态卡占据主视觉，"刷新"按钮冗余 | M 折叠状态卡 | 低 |
| **5. 语音引擎** | 3 个 section 都有"保存"按钮 + AsrTest 常驻 | **L** 重构 section | 中 |
| **6. 热词词库** | 自定义分类默认 Switch=off 像禁用；"重置"无二次确认 | M 改默认 + confirm | 中 |
| **7. 指令整理** | chat 模式预设并列 + AppPromptRules 与 AppScenarios 重复 | **L** 折叠/合并 | 高 |
| **8. AI 供应商** | "保存"按钮冗余 + 模型 chip 列表复杂 | M 实时保存 + select | 中 |
| **9. 通用设置** | `window.confirm` 原生弹窗 | S 改 inline | 低 |
| **Sidebar** | 命名不一致（"指令整理" vs "AI 整理"） + 4 个二级页藏在弹窗 | M 重排 + 改名 | 中 |

**全局跨页规则**：
1. **所有配置字段实时保存**（onChange → setSetting）
2. **只有一次性任务保留按钮**（导入、重置、添加）
3. **删除"使用统计"页面**（用户原话点名）
4. **删除"诊断"二级页**（放到底部"关于"或 About）
5. **Sidebar 命名统一为页面 title**

---

## 1. 工作台 `Home.tsx`

**改动**：M（重写首屏，删除 ~70 行）

**删除**：
- `Home.tsx:78-83` `cards` 数组（4 张统计卡片）
- `Home.tsx:130-155` 整个 grid 渲染
- `Home.tsx:85` `isNewUser` 判断（首屏提示已足够）
- `Home.tsx:118-128` 新用户引导条
- `Home.tsx:157-159` `FeedbackSection`（移到 About 页底部）
- `Home.tsx:38-46` `formatChineseNumber` / `formatTime` / `formatKey` 部分函数

**保留**：
- `PageHeader`（标题"随口说，出色写" + 一句话操作提示）
- `AppScenarioIndicator`（当前模式指示器）

**新增**：
- **大字按键提示**：单行 Hero — `按下 [按键] 开始口述，再按一次结束并插入文本`
- **快捷操作面板**（4 个，常用入口）：
  - 🎙️ 开始录音（点击触发 hands-free 快捷键等效）
  - 📋 查看最近 5 条历史（点击展开 inline）
  - 🎯 打开当前应用词库（点击跳 `/hotwords?app=xxx`）
  - ⚙️ 当前模式（点击展开快速切换）

**视觉**：首屏 ≤ 60vh，所有内容 ≤ 1 屏可见，按键提示字号 `text-3xl` 起。

---

## 2. 历史记录 `History.tsx`

**改动**：S（微调，~20 行）

**调整**：
- 默认分页 100 → **默认 50 条，加载更多按钮改为 "加载更多 (N)" 显示剩余数量**
- 搜索防抖 300ms → **150ms**
- 重新识别失败时 inline 错误提示（替代 `void` 吞错）
- 搜索框加 `Cmd+K` / `Ctrl+K` focus 快捷键
- 顶部加 3 个快速过滤：今天 / 本周 / 本月（点击切 filter）

---

## 3. 会议纪要 `Meeting.tsx`

**改动**：S（文案调整，< 10 行）

**调整**：
- 状态徽章文字删掉 "(已识别 N 句)" 细节
- 自动生成标题如果太长（> 20 字）改 ellipsis
- 会议结果区如未支持手动改标题 → 加 inline 编辑（1 步）

---

## 4. 知识库 `KnowledgeBase.tsx`

**改动**：M（折叠状态卡，~40 行）

**改前**：`KnowledgeBase.tsx:138-181` 大型状态卡占据主视觉。

**改后**：
- **顶部一行 status bar**：`模型：就绪 · 23 文档 · 1024 分块 · [加载模型]`
- 删除 "刷新" 按钮（导入后自动 refresh 已做到）
- 删除"缓存路径"技术细节
- 召回测试输入框加 `Cmd+Enter` 提交
- 文档列表保留，导入按钮右上角悬浮

---

## 5. 语音引擎 `VoiceEnginePage.tsx`

**改动**：**L（重构 3 个 section，~150 行）**

**核心规则**：**所有配置字段实时保存**。删除所有"保存"按钮。

**改动清单**：
- `CloudAPISection.tsx:280` — **删除"保存"按钮**，`onChange` 直接 `setSetting`
- `CloudAPISection.tsx:291-317` — OMNI prompt 预设切换实时保存
- `ServerSection.tsx:88-93` — **合并"测试"+"保存"**：测试即保存，1 个按钮
- `AsrTestSection` — **默认折叠**为 PageSection `action`，只露"开始测试"按钮，展开后展示结果
- `WorkModeSection` — 三卡片描述文字缩短（"本地/云 API/服务器" 三个字即可）
- omni 模式自动隐藏 AI 整理相关 UI（避免用户重复配置）
- `MicrophoneSection` 同理实时保存

---

## 6. 热词词库 `Dictionary.tsx`

**改动**：M（默认行为调整 + confirm，~50 行）

**改动清单**：
- **新建分类默认 Switch = on**（`Dictionary.tsx:144-146` 改默认 `active = true`），用户加完再决定关
- **"历史未分类词汇"默认展开**（`Dictionary.tsx:293-333`），badge 显示数量
- **"重置"按钮加 confirm dialog**（删除有风险）
- 文本替换 tab 导出按钮：现在只在 hotwords 显示，**文本替换 tab 也加导出**
- 工作台底部加 "识别错误？点这里修正" 链接 → `/hotwords?tab=replace`

---

## 7. 指令整理 `AIInstructionsPage.tsx`

**改动**：**L（折叠 + 合并重复，~120 行）**

**改动清单**：
- **chat 模式 PromptPresetSection 默认折叠**（多数用户只关心 proofread）
- **AppPromptRulesSection 与 AppScenariosPage 合并**：删除 AIInstructionsPage 内 `AppPromptRulesSection`，跳转到 AppScenarios 或保留为 inline section
- **KnowledgeBaseToggle 和 TavilySearchToggle 折叠为"高级功能"** section
- 顶部加 "快速试用" 按钮：一键应用 demo 校对预设（针对新用户）
- **删除 `AIProofreadToggle`**（与 TitleBar Switch 重复）：改为只读展示 "AI 整理：开 / 关"

**风险**：AppScenariosPage 在 SettingsDialog 弹窗内——需先把它移到一级页面或 inline section 才能合并。

---

## 8. AI 供应商 `AIServicePage.tsx`

**改动**：M（实时保存 + 模型选择简化，~80 行）

**改动清单**：
- **删除"保存"按钮**（`AIProviderSection.tsx:344-350`），所有字段 onChange 实时保存
- 模型 chip 列表改 `<select>` 下拉（更紧凑、更快）
- 模型输入回车直接切换到该模型（`handleAddModel` 增强）
- workMode === 'server' 时**整个 AI 配置隐藏**（无法配置）
- API 地址自动填充默认值且置灰（已部分做到，完善）

---

## 9. 通用设置 `Settings.tsx` → `GeneralSettingsPage.tsx`

**改动**：S（< 20 行）

**改动清单**：
- `GeneralSettingsPage.tsx:84-86` `window.confirm` 改 inline toast/banner
- 音频保留 + 日志保留合并到同一 `PageSection` "数据保留"

---

## 10. Sidebar 一级菜单重排

**改动**：M（菜单命名 + 顺序 + 删除冗余，~40 行）

**当前 9 项** → **目标 8 项**：

| 当前 | 目标 | 理由 |
|---|---|---|
| 工作台 | **工作台** | 保留 |
| 历史记录 | **历史记录** | 保留 |
| 会议纪要 | **会议纪要** | 保留 |
| 知识库 | **知识库** | 移到配置分组或合并到 AI 整理 |
| 语音引擎 | **语音引擎** | 保留 |
| 热词词库 | **热词** | 改名简洁 |
| 指令整理 | **AI 整理** | 与页面 title 一致 |
| AI 供应商 | **AI 供应商** | 保留 |
| 通用设置 | **通用设置** | 保留 |

**删除二级弹窗**：
- 删除 SettingsDialog 内"使用统计"页（用户原话）
- 删除 SettingsDialog 内"诊断"页（合并到 About 页）
- 保留"外观"页（一级菜单更合理）

**最终 Sidebar 分组**：
- 日常：工作台 / 历史记录 / 会议纪要（3 项）
- 配置：语音引擎 / 热词 / AI 整理 / AI 供应商 / 知识库 / 外观 / 通用设置（7 项）

---

## 执行顺序（建议 3 个 PR 拆批）

### PR-1：删除冗余，1-2 天（**优先**）
- ✅ 工作台删除统计卡片（用户原话）
- ✅ 删除"使用统计"页面
- ✅ 删除"诊断"二级页（移 About）
- ✅ 通用设置 confirm 改 inline
- ✅ 历史记录微调（150ms 防抖 + Cmd+K）
- ✅ 会议纪要微调文案

### PR-2：实时保存，1-2 天
- ✅ 语音引擎：删除所有"保存"按钮 + AsrTestSection 折叠
- ✅ AI 供应商：删除保存按钮 + 模型改 select
- ✅ 热词词库：默认开 + 重置 confirm + 文本替换导出

### PR-3：合并折叠，1-2 天
- ✅ 知识库：状态卡折叠为顶部一行
- ✅ 指令整理：chat 预设折叠 + AppPromptRules 合并
- ✅ Sidebar：重排 + 改名 + 删除冗余弹窗

---

## 验收清单（每 PR）

- [ ] `npx tsc --noEmit` 0 错误
- [ ] `npx vitest run` 无回归
- [ ] `npx tauri build` 成功
- [ ] smoke：8 个页面 1 屏内完成核心操作（≤ 3 秒）
- [ ] 无新增"保存"按钮（grep `保存|save|confirm`）
- [ ] Sidebar 与页面 title 一致（grep `dictName` / `instructionsTitle`）

---

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| AppPromptRulesSection 与 AppScenarios 合并可能漏功能 | 先 diff 两个组件 API，确认是子集再合并 |
| 实时保存引入 debounce 问题 | `setSetting` 内部已有 throttle；不复写 |
| Sidebar 改名破坏用户肌肉记忆 | 一次性提供"新菜单引导"（首页一行 tip，3 天后消失） |
| 删除"保存"按钮导致用户不知已生效 | 加 micro-feedback（toast "已保存" 1.5s 自动消失） |
| 模型 chip → select 改变操作 | 用 `<select>` + 内置 `<option>` 默认模型，input 仍保留 |

---

## 不在范围

- ❌ 改 Rust 后端
- ❌ 新增快捷键
- ❌ 改录音 pipeline
- ❌ 改 Sidebar 图标库（lucide-react 保持）
- ❌ 国际化（i18n）调整文案——保持中文