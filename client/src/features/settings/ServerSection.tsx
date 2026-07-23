// 服务器模式配置 — 服务地址 + 连接状态（实时保存：onBlur 持久化 URL）

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import PageSection from '@/components/ui/PageSection'
import ToggleChip from '@/components/ui/ToggleChip'
import {
  getBackendBaseUrl,
  setBackendBaseUrl as persistBackendBaseUrl,
} from '@/services/runtimeConfig'
import { reconnectProvider } from '@/services/recorder'
import { getSetting, setSetting } from '@/services/store'

export default function ServerSection() {
  const [backendBaseUrl, setBackendBaseUrl] = useState('')
  const [serviceMessage, setServiceMessage] = useState('')
  const [serviceTesting, setServiceTesting] = useState(false)
  const [asrLanguage, setAsrLanguage] = useState('auto')

  useEffect(() => {
    setBackendBaseUrl(getBackendBaseUrl())
    void getSetting('server.language', 'auto').then((v) => setAsrLanguage(String(v || 'auto')))
  }, [])

  const normalize = (v: string) => v.trim().replace(/\/+$/, '')

  /**
   * 测试连接 + 自动持久化最新 URL（如果用户改了但没失焦，"测试" 也是 save 的入口）。
   * 不再保留独立"保存"按钮 — 单一动作 = 测试 + 保存。
   */
  const handleTestAndConnect = async () => {
    const normalized = normalize(backendBaseUrl)
    if (!normalized) { setServiceMessage('请先输入服务地址'); return }
    try {
      new URL(normalized)
    } catch {
      setServiceMessage('服务地址格式不正确'); return
    }

    setServiceTesting(true)
    setServiceMessage('')

    // 1. 持久化最新 URL（即便用户还没失焦）
    try {
      const next = await persistBackendBaseUrl(normalized)
      setBackendBaseUrl(next)
    } catch (error) {
      setServiceMessage(`保存失败：${String(error)}`)
      setServiceTesting(false)
      return
    }

    // 2. 测试连接
    try {
      const response = await fetch(`${normalized}/healthz`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json() as { status?: string; asr?: boolean; llm?: boolean }
      setServiceMessage(`✅ 已保存并连接：ASR=${payload.asr ? 'on' : 'off'}，LLM=${payload.llm ? 'on' : 'off'}`)
      reconnectProvider()
    } catch (error) {
      setServiceMessage(`已保存，但连接失败：${String(error)}`)
    } finally {
      setServiceTesting(false)
    }
  }

  // URL onBlur 时静默持久化（输入时不打扰用户）
  const handleUrlBlur = async () => {
    const normalized = normalize(backendBaseUrl)
    if (!normalized) return
    try { new URL(normalized) } catch { return }
    try {
      const next = await persistBackendBaseUrl(normalized)
      setBackendBaseUrl(next)
    } catch { /* 静默失败：用户没点测试就不打扰 */ }
  }

  return (
    <>
      <PageSection title="服务地址" description="输入你部署的 SayDone 服务器地址，输入框失焦时自动保存。" divided={false}>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={backendBaseUrl}
              onChange={(e) => setBackendBaseUrl(e.target.value)}
              onBlur={handleUrlBlur}
              placeholder="https://saydone.app"
              className="h-9 flex-1 rounded-md bg-secondary/60 px-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-cta/30"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              onClick={() => void handleTestAndConnect()}
              disabled={serviceTesting}
            >
              {serviceTesting ? '测试中...' : '测试连接'}
            </Button>
          </div>
          {serviceMessage && <p className="text-sm text-muted-foreground">{serviceMessage}</p>}
        </div>
      </PageSection>

      <PageSection title="识别语言" description="大部分场景选「自动」即可。纯英文会议建议选「英文」以提高准确率。">
        <div className="flex gap-2">
          {([
            { value: 'auto', label: '自动' },
            { value: 'zh', label: '中文' },
            { value: 'en', label: '英文' },
          ] as const).map((lang) => (
            <ToggleChip
              key={lang.value}
              selected={asrLanguage === lang.value}
              onClick={() => { setAsrLanguage(lang.value); void setSetting('server.language', lang.value) }}
            >
              {lang.label}
            </ToggleChip>
          ))}
        </div>
      </PageSection>
    </>
  )
}