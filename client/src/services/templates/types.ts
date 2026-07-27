// 文档模板类型定义

export interface TemplateVariable {
  key: string
  label: string
  defaultValue?: string
}

export interface DocumentTemplate {
  id: string
  name: string
  triggerKeywords: string[]
  content: string
  variables?: TemplateVariable[]
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface TemplateMatchResult {
  template: DocumentTemplate | null
  score: number
}

export const DEFAULT_TEMPLATE_THRESHOLD = 0.6
