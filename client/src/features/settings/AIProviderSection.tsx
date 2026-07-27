// AI 校对供应商配置 — 独立于 ASR 引擎
// 每个供应商的配置独立存储，切换不会互相覆盖

import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open as shellOpen } from '@tauri-apps/plugin-shell'
import { Eye, EyeOff, X, AlertTriangle, ExternalLink } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { getSetting, setSetting } from '@/services/store'

const AI_PROVIDERS = [
  { value: 'openai_compat', label: 'OpenAI 兼容', urlPlaceholder: 'https://api.openai.com', modelPlaceholder: 'gpt-4o-mini' },
  { value: 'deepseek', label: 'DeepSeek', urlPlaceholder: 'https://api.deepseek.com', modelPlaceholder: 'deepseek-v4-flash' },
  { value: 'doubao', label: '豆包（火山方舟）', urlPlaceholder: 'https://ark.cn-beijing.volces.com/api/v3', modelPlaceholder: 'doubao-seed-2-0-lite-260215' },
  { value: 'qwen', label: '通义千问', urlPlaceholder: 'https://dashscope.aliyuncs.com/compatible-mode', modelPlaceholder: 'qwen-plus' },
  { value: 'ollama', label: 'Ollama', urlPlaceholder: 'http://127.0.0.1:11434', modelPlaceholder: 'qwen2.5:7b' },
]

interface TestResult { ok: boolean; message: string; elapsed_ms: number; detail?: string }

/** 根据 AI 供应商检查 API Key 格式，返回提示文字（空字符串表示格式正常） */
function checkAiKeyFormat(provider: string, key: string): string {
  const k = key.trim()
  if (!k) return ''
  if (provider === 'deepseek') {
    if (!/^sk-/.test(k)) {
      return 'DeepSeek API Key 通常以 sk- 开头，请确认格式是否正确'
    }
    // sk- 后跟 32 位十六进制，总长 35 位
    if (k.length !== 35) {
      return `DeepSeek API Key 通常为 35 位（当前 ${k.length} 位），请确认是否正确`
    }
  } else if (provider === 'doubao') {
    // 豆包 AI API Key：UUID 格式，36 位
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) {
      return `豆包 API Key 通常为 UUID 格式（36 位，当前 ${k.length} 位），请确认格式是否正确`
    }
  } else if (provider === 'qwen') {
    if (!/^sk-/.test(k)) {
      return '通义千问 API Key 通常以 sk- 开头，请确认格式是否正确'
    }
    if (k.length !== 35) {
      return `通义千问 API Key 通常为 35 位（当前 ${k.length} 位），请确认是否正确`
    }
  }
  return ''
}

function PasswordInput({ value, onChange, placeholder, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground/50 hover:text-muted-foreground"
        tabIndex={-1}
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

// 按供应商独立存储配置的 key 前缀
function aiSettingKey(provider: string, field: string) {
  return `cloudAi.${provider}.${field}`
}

export default function AIProviderSection() {
  const [aiProvider, setAiProvider] = useState('deepseek')
  const [aiApiUrl, setAiApiUrl] = useState('')
  const [aiApiKey, setAiApiKey] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [aiModels, setAiModels] = useState<string[]>([])
  const [newModelInput, setNewModelInput] = useState('')
  const [aiTesting, setAiTesting] = useState(false)
  const [aiMessage, setAiMessage] = useState('')
  const [aiDetail, setAiDetail] = useState('')

  useEffect(() => {
    void loadSettings()
  }, [])

  // 每个供应商的默认模型（新用户首次使用时自动填充）
  const DEFAULT_MODELS: Record<string, string> = {
    deepseek: 'deepseek-v4-flash',
    qwen: 'qwen3.6-flash',
  }

  // 每个供应商的默认 API 地址（新用户首次使用时自动填充）
  const DEFAULT_URLS: Record<string, string> = {
    deepseek: 'https://api.deepseek.com',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode',
  }

  // 加载指定供应商的配置
  async function loadProviderConfig(provider: string) {
    let url = await getSetting(aiSettingKey(provider, 'apiUrl'), '') as string
    const key = await getSetting(aiSettingKey(provider, 'apiKey'), '') as string
    let model = await getSetting(aiSettingKey(provider, 'model'), '') as string
    const modelsStr = await getSetting(aiSettingKey(provider, 'models'), '') as string
    let models = modelsStr ? modelsStr.split(',').map(s => s.trim()).filter(Boolean) : []
    // 新用户首次使用：如果没有 URL，自动填充默认地址
    const defaultUrl = DEFAULT_URLS[provider]
    if (!url && defaultUrl) {
      url = defaultUrl
    }
    // 新用户首次使用：如果没有任何模型配置，自动填充默认模型
    const defaultModel = DEFAULT_MODELS[provider]
    if (!model && models.length === 0 && defaultModel) {
      model = defaultModel
      models = [defaultModel]
    }
    // 兼容旧数据：如果有 model 但不在 models 列表里，加进去
    if (model && !models.includes(model)) {
      models.unshift(model)
    }
    setAiApiUrl(url)
    setAiApiKey(key)
    setAiModel(model)
    setAiModels(models)
    setNewModelInput('')
  }

  async function loadSettings() {
    const provider = await getSetting('cloudAi.provider', 'deepseek') as string
    setAiProvider(provider)
    await loadProviderConfig(provider)
  }

  // 切换供应商：实时保存 provider
  async function handleProviderChange(newProvider: string) {
    setAiProvider(newProvider)
    setAiMessage('')
    await setSetting('cloudAi.provider', newProvider)
    await loadProviderConfig(newProvider)
  }

  // 实时保存 API URL
  async function handleApiUrlChange(v: string) {
    setAiApiUrl(v)
    await Promise.all([
      setSetting(aiSettingKey(aiProvider, 'apiUrl'), v),
      setSetting('cloudAi.apiUrl', v),
    ])
  }

  // 实时保存 API Key
  async function handleApiKeyChange(v: string) {
    setAiApiKey(v)
    await Promise.all([
      setSetting(aiSettingKey(aiProvider, 'apiKey'), v),
      setSetting('cloudAi.apiKey', v),
    ])
  }

  // 选中模型：实时保存（点 chip 即可）
  async function handleSelectModel(name: string) {
    setAiModel(name)
    await Promise.all([
      setSetting(aiSettingKey(aiProvider, 'model'), name),
      setSetting('cloudAi.model', name),
    ])
  }

  // 添加模型：实时保存（输入框回车或点添加按钮）
  async function handleAddModel() {
    const name = newModelInput.trim()
    if (!name) return
    if (aiModels.includes(name)) {
      // 已存在 → 直接选中
      await handleSelectModel(name)
      setNewModelInput('')
      return
    }
    const updated = [...aiModels, name]
    setAiModels(updated)
    // 自动选中新加的模型
    setAiModel(name)
    setNewModelInput('')
    await Promise.all([
      setSetting(aiSettingKey(aiProvider, 'models'), updated.join(',')),
      setSetting(aiSettingKey(aiProvider, 'model'), name),
      setSetting('cloudAi.model', name),
    ])
  }

  // 删除模型：实时保存
  async function handleRemoveModel(name: string) {
    const updated = aiModels.filter(m => m !== name)
    setAiModels(updated)
    // 如果删除的是当前选中的，切换到第一个
    let nextModel = aiModel
    if (aiModel === name) {
      nextModel = updated[0] || ''
      setAiModel(nextModel)
    }
    await Promise.all([
      setSetting(aiSettingKey(aiProvider, 'models'), updated.join(',')),
      ...(aiModel === name ? [
        setSetting(aiSettingKey(aiProvider, 'model'), nextModel),
        setSetting('cloudAi.model', nextModel),
      ] : []),
    ])
  }

  // 测试连接 — 不再隐式保存（所有字段已实时保存）
  async function testConnection() {
    setAiTesting(true)
    setAiMessage('')
    setAiDetail('')
    try {
      const result = await invoke<TestResult>('test_ai_connection', {
        config: { provider: aiProvider, api_url: aiApiUrl, api_key: aiApiKey, model: aiModel },
      })
      setAiMessage(result.ok ? `${result.message}` : `连接失败：${result.message}`)
      setAiDetail(result.detail || '')
    } catch (err) {
      setAiMessage(`测试失败：${String(err)}`)
      setAiDetail('')
    } finally {
      setAiTesting(false)
    }
  }

  const inputClass = 'h-9 w-full rounded-md bg-secondary/60 px-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-cta/30'
  const selectClass = 'h-9 w-full rounded-md bg-secondary/60 px-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-cta/30'

  return (
    <>
      {/* AI 供应商配置 */}
      <Card>
        <CardContent className="p-6">
          <h2 className="mb-1 font-serif text-lg font-medium tracking-[0.08em] text-foreground">AI 供应商</h2>
          <p className="mb-4 text-xs leading-[1.85] text-muted-foreground">
            配置 AI 润色之供给。首推 DeepSeek deepseek-v4-flash，次荐通义千问 qwen3.6-flash。
          </p>
          <button
            type="button"
            onClick={() => void shellOpen('https://my.feishu.cn/wiki/EEdswP97PijkmAkSr4HcUiVlnxf')}
            className="mb-4 inline-flex items-center gap-1 text-xs text-primary/70 underline underline-offset-2 decoration-primary/30 transition-colors hover:text-primary hover:decoration-primary/60"
          >
            SayDone AI 润色供应商配置
            <ExternalLink className="h-3 w-3" />
          </button>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">供应商</label>
              <select value={aiProvider} onChange={(e) => void handleProviderChange(e.target.value)} className={selectClass}>
                {AI_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">
                {aiProvider === 'ollama' ? 'Ollama 地址' : 'API 地址'}
              </label>
              <input
                value={aiApiUrl}
                onChange={(e) => void handleApiUrlChange(e.target.value)}
                placeholder={AI_PROVIDERS.find((p) => p.value === aiProvider)?.urlPlaceholder || 'https://api.example.com'}
                className={inputClass}
              />
            </div>
            {aiProvider !== 'ollama' && (
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">API Key</label>
                <PasswordInput
                  value={aiApiKey}
                  onChange={(v) => void handleApiKeyChange(v)}
                  placeholder="输入 API Key"
                  className={inputClass}
                />
                {checkAiKeyFormat(aiProvider, aiApiKey) && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-warning">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {checkAiKeyFormat(aiProvider, aiApiKey)}
                  </p>
                )}
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">模型</label>
              <div className="flex items-center gap-2">
                <input
                  value={newModelInput}
                  onChange={(e) => setNewModelInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleAddModel() }}
                  placeholder={AI_PROVIDERS.find((p) => p.value === aiProvider)?.modelPlaceholder || '输入模型名称后回车添加'}
                  className={inputClass}
                />
                <Button
                  variant="outline" size="sm" className="h-9 shrink-0"
                  onClick={() => void handleAddModel()}
                  disabled={!newModelInput.trim()}
                >
                  添加
                </Button>
              </div>
              {aiModels.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {aiModels.map((m) => (
                    <span
                      key={m}
                      onClick={() => void handleSelectModel(m)}
                      className={cn(
                        'inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors',
                        m === aiModel
                          ? 'border-foreground bg-foreground text-background font-medium'
                          : 'bg-secondary/50 text-foreground hover:border-primary/30',
                      )}
                    >
                      {m}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void handleRemoveModel(m) }}
                        className="rounded-full p-0.5 transition-colors hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`删除模型 ${m}`}
                      >
                        <X className="h-2.5 w-2.5 text-muted-foreground" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="pt-1">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="sm" className="h-9"
                  onClick={() => void testConnection()}
                  disabled={aiTesting || !aiApiUrl || (aiProvider !== 'ollama' && !aiApiKey) || !aiModel}
                >
                  {aiTesting ? '测试中...' : '测试连接'}
                </Button>
              </div>
              {aiMessage && (
                <div className={cn(
                  'mt-2 rounded-md px-3 py-2 text-xs font-sans',
                  aiMessage.startsWith('连接失败') || aiMessage.startsWith('测试失败')
                    ? 'bg-destructive/15 text-destructive'
                    : 'bg-success/15 text-success',
                )}>
                  <div className={cn(
                    'font-medium',
                    aiMessage.startsWith('连接失败') || aiMessage.startsWith('测试失败')
                      ? 'text-destructive dark:text-destructive'
                      : 'text-green-600 dark:text-green-400',
                  )}>
                    {aiMessage.startsWith('连接失败') || aiMessage.startsWith('测试失败') ? '✗ ' : '✓ '}
                    {aiMessage}
                  </div>
                  {aiDetail && (
                    <pre className="mt-1.5 whitespace-pre-wrap border-t border-current/10 pt-1.5 font-sans text-muted-foreground">{aiDetail}</pre>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
