// AI 整理设置页 — Tavily 联网搜索卡片
//  - 启用开关
//  - API Key 输入（PasswordInput）
//  - 主题（general / news）
//  - 结果数（默认 5）
//  - 测试搜索按钮（验证当前配置是否有效）

import { useCallback, useEffect, useState } from 'react'
import { Globe, Eye, EyeOff, ExternalLink } from 'lucide-react'
import PageSection from '@/components/ui/PageSection'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/Button'
import {
  tavilyGetConfig,
  tavilySetConfig,
  tavilyTestSearch,
} from '@/services/tavily/bridge'
import type { SearchResults, TavilyConfig, TavilyTopic } from '@/services/tavily/types'

const DEFAULT_CONFIG: TavilyConfig = {
  enabled: false,
  apiKey: '',
  maxResults: 5,
  topic: 'general',
}

function ApiKeyInput({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="tvly-..."
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded border border-input bg-background px-2 py-1 pr-8 text-sm font-mono"
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground/50 hover:text-muted-foreground"
        tabIndex={-1}
        aria-label={visible ? '隐藏密钥' : '显示密钥'}
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

export default function TavilySearchToggle() {
  const [config, setConfig] = useState<TavilyConfig>(DEFAULT_CONFIG)
  const [loaded, setLoaded] = useState(false)
  const [testQuery, setTestQuery] = useState('')
  const [testState, setTestState] = useState<
    { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok'; data: SearchResults } | { kind: 'err'; message: string }
  >({ kind: 'idle' })

  const refresh = useCallback(async () => {
    try {
      const cfg = await tavilyGetConfig()
      setConfig({
        enabled: cfg.enabled,
        apiKey: cfg.apiKey || '',
        maxResults: cfg.maxResults || 5,
        topic: cfg.topic || 'general',
      })
    } catch (e) {
      console.error('[tavily] load failed', e)
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 持久化辅助：merge 后写
  const persist = useCallback(async (next: TavilyConfig) => {
    try {
      await tavilySetConfig(next)
    } catch (e) {
      console.error('[tavily] save failed', e)
    }
  }, [])

  const handleEnabledToggle = async (next: boolean) => {
    const updated = { ...config, enabled: next }
    setConfig(updated)
    void persist(updated)
  }

  const handleKeyChange = (v: string) => {
    const updated = { ...config, apiKey: v }
    setConfig(updated)
    // API key 改了就写后端，不做 trim（用户可能有意保留前后空格）
    void persist(updated)
  }

  const handleTopicChange = (t: TavilyTopic) => {
    const updated = { ...config, topic: t }
    setConfig(updated)
    void persist(updated)
  }

  const handleMaxResultsChange = (n: number) => {
    const updated = { ...config, maxResults: n }
    setConfig(updated)
    void persist(updated)
  }

  const handleTest = async () => {
    const q = testQuery.trim()
    if (!q) {
      setTestState({ kind: 'err', message: '请输入要测试的查询内容' })
      return
    }
    setTestState({ kind: 'loading' })
    try {
      const result = await tavilyTestSearch({ query: q })
      setTestState({ kind: 'ok', data: result })
    } catch (e) {
      setTestState({ kind: 'err', message: String(e) })
    }
  }

  return (
    <PageSection
      title="联网搜索 (Tavily)"
      description={
        <>
          启用后，AI Chat 模式会自动调用 Tavily 联网搜索，把最新结果作为上下文送给大模型。
          仅 Chat 模式启用，Proofread 模式不受影响。失败时会自动降级到无搜索模式，不影响 AI 回答。
        </>
      }
      action={
        <Switch
          checked={config.enabled}
          onChange={() => {
            if (loaded) void handleEnabledToggle(!config.enabled)
          }}
          disabled={!loaded}
        />
      }
      divided={false}
    >
      <div className="space-y-4">
        {/* API Key */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">API Key</label>
          <ApiKeyInput value={config.apiKey} onChange={handleKeyChange} />
          <p className="text-xs text-muted-foreground">
            在{' '}
            <a
              href="https://tavily.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              tavily.com
              <ExternalLink className="h-3 w-3" />
            </a>{' '}
            注册后获取，仅保存在本地配置表，不会上传到任何第三方。
          </p>
        </div>

        {/* Topic + MaxResults */}
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">主题</span>
            <select
              value={config.topic}
              onChange={(e) => handleTopicChange(e.target.value as TavilyTopic)}
              className="rounded border border-input bg-background px-2 py-1 text-sm"
              disabled={!loaded}
            >
              <option value="general">通用</option>
              <option value="news">新闻</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">结果数</span>
            <select
              value={config.maxResults}
              onChange={(e) => handleMaxResultsChange(Number(e.target.value))}
              className="rounded border border-input bg-background px-2 py-1 text-sm"
              disabled={!loaded}
            >
              {[3, 5, 8, 10].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Test */}
        <div className="space-y-2 rounded border border-border/40 bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">测试搜索</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              placeholder="输入查询关键词试一下当前 API key 是否可用"
              className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleTest()
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleTest()}
              disabled={testState.kind === 'loading' || !testQuery.trim()}
            >
              {testState.kind === 'loading' ? '搜索中…' : '测试'}
            </Button>
          </div>

          {testState.kind === 'err' && (
            <div className="text-xs text-destructive">❌ {testState.message}</div>
          )}

          {testState.kind === 'ok' && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                命中 {testState.data.results.length} 条（耗时 {testState.data.elapsed_ms}ms）
              </div>
              {testState.data.results.length === 0 ? (
                <div className="text-xs text-muted-foreground">该查询没返回任何结果。</div>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {testState.data.results.slice(0, 5).map((r, idx) => (
                    <li key={idx} className="rounded border border-border/30 bg-background p-2">
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-primary hover:underline"
                      >
                        {r.title || '(无标题)'}
                      </a>
                      <div className="mt-0.5 line-clamp-2 text-muted-foreground">
                        {r.content}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </PageSection>
  )
}
