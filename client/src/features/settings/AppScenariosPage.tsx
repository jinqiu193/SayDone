/**
 * AppScenariosPage (#5 应用场景配置)
 *
 * - 自动规则说明（当前已识别的"应用 → 风格"映射）
 * - 用户手动覆盖列表：所有已覆盖的 processName + 风格
 * - 添加新覆盖：手动输入 process 名（高级用户）
 */

import { useMemo } from 'react'
import { Code2, Edit3, FileText, Mail, MessageCircle, Sparkles, Type, Trash2, RotateCcw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  POLISH_STYLE_META,
  type PolishStyleId,
} from '@/services/recorder/helpers'
import { useAppScenario } from '@/features/appScenarios/AppScenarioContext'

const ICONS = {
  'message-circle': MessageCircle,
  type: Type,
  mail: Mail,
  'file-text': FileText,
  'code-2': Code2,
  'edit-3': Edit3,
  sparkles: Sparkles,
} as const

interface BuiltinRule {
  style: PolishStyleId
  examples: string[]
  desc: string
}

const BUILTIN_RULES: BuiltinRule[] = [
  { style: 'code',   examples: ['Code.exe', 'Cursor', 'IntelliJ IDEA', 'VS', 'Xcode', 'Windows Terminal'], desc: '保留英文变量名 / 命令 / 技术名词，不强行翻译' },
  { style: 'email',  examples: ['Outlook', 'Foxmail', 'Thunderbird', '邮箱大师'], desc: '敬语开头 + 段落规范 + 自动落款' },
  { style: 'note',   examples: ['Notion', 'Obsidian', 'Typora', 'Logseq', '语雀'], desc: '结构化输出 (Markdown 标题 / 列表)' },
  { style: 'formal', examples: ['Word', 'Excel', 'PowerPoint', 'Pages', 'WPS'], desc: '严谨书面，逗号句号齐全，避免口语化用词' },
  { style: 'casual', examples: ['微信', 'QQ', '钉钉', '飞书', 'Slack', 'Discord', 'Telegram'], desc: '自然口语风，去掉一切书面语修饰' },
]

export default function AppScenariosPage() {
  const { overrides, setOverride, clearAllOverrides, meta } = useAppScenario()

  const overrideEntries = useMemo(
    () => Object.entries(overrides).sort(([a], [b]) => a.localeCompare(b)),
    [overrides],
  )

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">应用场景</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          根据当前焦点窗口自动选择合适的 AI 润色风格。也可手动为特定应用指定风格或锁定当前选择。
        </p>
      </div>

      <div className="space-y-5">
        {/* 内置规则 */}
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 text-lg font-semibold">自动识别规则</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              这些应用会被自动识别并匹配对应的 AI 润色风格。
            </p>
            <div className="space-y-3">
              {BUILTIN_RULES.map((rule) => {
                const ruleMeta = meta[rule.style]
                const Icon = ICONS[ruleMeta.icon]
                return (
                  <div
                    key={rule.style}
                    className="flex items-start gap-3 rounded-lg bg-surface-2 px-4 py-3"
                  >
                    <div className="rounded-md bg-primary/10 p-2 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{ruleMeta.label}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{rule.desc}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {rule.examples.map((ex) => (
                          <span
                            key={ex}
                            className="rounded-full bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground border border-border/40"
                          >
                            {ex}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 rounded-md bg-info/10 px-3 py-2 text-xs text-muted-foreground">
              <Sparkles className="mr-1 inline h-3 w-3" />
              {meta.auto.desc} · 未在以上列表中的应用会保持「自动」状态，不会被强制应用任何风格。
            </div>
          </CardContent>
        </Card>

        {/* 用户覆盖 */}
        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">手动覆盖</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  为某个进程名强制设置风格，覆盖自动识别规则。
                </p>
              </div>
              {overrideEntries.length > 0 && (
                <button
                  type="button"
                  onClick={() => void clearAllOverrides()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <RotateCcw className="h-3 w-3" />
                  清除所有覆盖
                </button>
              )}
            </div>

            {overrideEntries.length === 0 ? (
              <div className="rounded-lg bg-muted/20 px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">还没有任何覆盖。</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  在首页顶部点击当前模式徽章，手动指定该应用的风格后会自动出现在此列表。
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {overrideEntries.map(([processName, style]) => {
                  const m = meta[style]
                  const Icon = ICONS[m.icon]
                  return (
                    <div
                      key={processName}
                      className="flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-3 py-2"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-primary" />
                      <span className="flex-1 truncate font-mono text-sm">{processName}</span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          `bg-primary/15 text-primary`,
                        )}
                      >
                        {m.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => void setOverride(processName, null)}
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`删除 ${processName} 的覆盖`}
                        title="删除覆盖"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
