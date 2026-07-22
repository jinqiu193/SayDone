import { invoke } from '@tauri-apps/api/core'
import type { SearchQuery, SearchResults, TavilyConfig } from './types'

/** 读 Tavily 配置（含 enabled、apiKey、maxResults、topic） */
export function tavilyGetConfig() {
  return invoke<TavilyConfig>('tavily_get_config')
}

/** 写 Tavily 配置 */
export function tavilySetConfig(config: TavilyConfig) {
  return invoke<void>('tavily_set_config', { config })
}

/** 测试搜索：UI 点击"测试"按钮时调用，配置错误会返回 Err */
export function tavilyTestSearch(query: SearchQuery) {
  return invoke<SearchResults>('tavily_test_search', { query })
}
