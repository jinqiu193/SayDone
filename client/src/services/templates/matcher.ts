// 文档模板匹配服务
// 利用 RAG 向量搜索能力匹配模板

import { ragSearch, ragAddText } from '@/services/rag/bridge'
import { getTemplates, getTemplateThreshold, getTemplateMatchEnabled } from './store'
import type { DocumentTemplate, TemplateMatchResult } from './types'

const TEMPLATE_KB_ID = 'document_templates'

let templatesInitialized = false

export async function initTemplateIndex(): Promise<void> {
  if (templatesInitialized) return

  const templates = await getTemplates()
  for (const template of templates) {
    if (template.enabled) {
      const keywords = template.triggerKeywords.join(' ')
      const docId = `template_${template.id}`
      try {
        await ragAddText({
          title: template.name,
          content: keywords,
          kb_id: TEMPLATE_KB_ID,
        })
      } catch (e) {
        console.warn('[template] Failed to add template to index:', e)
      }
    }
  }
  templatesInitialized = true
}

export async function matchTemplate(query: string): Promise<TemplateMatchResult> {
  const enabled = await getTemplateMatchEnabled()
  if (!enabled) {
    return { template: null, score: 0 }
  }

  const threshold = await getTemplateThreshold()
  const templates = await getTemplates()
  const enabledTemplates = templates.filter((t) => t.enabled)

  if (enabledTemplates.length === 0) {
    return { template: null, score: 0 }
  }

  try {
    const hits = await ragSearch({
      query,
      top_k: 1,
      kb_id: TEMPLATE_KB_ID,
    })

    if (hits.length === 0) {
      return { template: null, score: 0 }
    }

    const topHit = hits[0]
    const score = topHit.score

    if (score < threshold) {
      return { template: null, score }
    }

    const docId = topHit.doc_id
    const templateId = docId.replace('template_', '')
    const matchedTemplate = enabledTemplates.find((t) => t.id === templateId)

    return {
      template: matchedTemplate || null,
      score,
    }
  } catch (e) {
    console.error('[template] Match failed:', e)
    return { template: null, score: 0 }
  }
}

export async function refreshTemplateIndex(): Promise<void> {
  templatesInitialized = false
  await initTemplateIndex()
}

export function getSystemPromptWithTemplate(template: DocumentTemplate): string {
  return `你是一个专业的文档写作助手。请根据用户输入，按照以下模板格式生成内容：

【模板】
${template.content}

【要求】
1. 严格按照模板格式生成内容
2. 根据用户描述填充模板中的占位符（{{...}}）
3. 如果用户没有提供某些信息，用"___"表示待填写
4. 保持专业、简洁的语言风格
5. 不要添加模板中没有的内容`
}
