// AI 服务配置页面

import AIProviderSection from './AIProviderSection'

export default function AIServicePage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-2 text-2xl font-bold">AI 供应商</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        选择并配置提供 AI 整理能力的服务商与密钥。AI 如何整理文字的规则，请前往「AI 整理」设置。
      </p>
      <div className="space-y-6">
        <AIProviderSection />
      </div>
    </div>
  )
}
