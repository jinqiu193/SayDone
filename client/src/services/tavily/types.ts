// Tavily types — frontend mirror of Rust types
// Field names use camelCase to match Tauri serde conventions

export type TavilyTopic = 'general' | 'news'

export interface TavilyConfig {
  enabled: boolean
  apiKey: string
  maxResults: number // default 5
  topic: TavilyTopic // default "general"
}

export interface SearchQuery {
  query: string
  maxResults?: number
  topic?: TavilyTopic
}

export interface SearchResultItem {
  title: string
  url: string
  content: string
  score?: number
}

export interface SearchResults {
  query: string
  results: SearchResultItem[]
  elapsed_ms: number
}

/** ai_chat 返回的 tavily_status 字段 */
export type TavilyStatus =
  | 'disabled' // 非 Chat 模式（Proofread）
  | 'not_enabled' // 用户配置 tavily.enabled=false
  | 'missing_api_key' // 用户启用但没填 key
  | 'ok' // 搜索成功
  | 'failed' // Tavily HTTP 失败，已降级
