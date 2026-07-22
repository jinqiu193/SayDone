/**
 * AppScenarioContext (#5 应用场景自动切换)
 *
 * 顶层 Context：跟踪当前焦点应用 + 用户手动覆盖的 polish style。
 * - 自动推断 (`resolvePolishStyle(context)`) 作为默认
 * - 用户在 Home 顶部条可手动覆盖某个 processName 的风格
 * - 持久化到 store，key 为 `scenarioOverrides: { [processName]: PolishStyleId }`
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ActiveAppContext } from '@/types/appContext'
import {
  POLISH_STYLE_META,
  resolvePolishStyle,
  type PolishStyleId,
} from '@/services/recorder/helpers'
import * as bridge from '@/services/bridge'
import { getSetting, setSetting } from '@/services/store'

interface AppScenarioContextValue {
  /** 当前焦点应用 ctx（实时） */
  activeContext: ActiveAppContext | null
  /** 自动识别开关 */
  autoDetectionEnabled: boolean
  /** 启用的规则 ID 列表 */
  enabledRuleIds: PolishStyleId[]
  /** 设置自动识别开关 */
  setAutoDetectionEnabled: (enabled: boolean) => Promise<void>
  /** 设置启用的规则 */
  setEnabledRules: (rules: PolishStyleId[]) => Promise<void>
  /** 经过用户覆盖/自动推断后的最终风格 */
  resolvedStyle: PolishStyleId
  /** 用户手动覆盖映射：processName → style */
  overrides: Record<string, PolishStyleId>
  /** 给特定 processName 设置覆盖风格，传 null 清除覆盖（回到 auto 推断） */
  setOverride: (processName: string, style: PolishStyleId | null) => Promise<void>
  /** 清除所有覆盖 */
  clearAllOverrides: () => Promise<void>
  /** 元数据 */
  meta: typeof POLISH_STYLE_META
  /** 最终 使用的风格（如果用户没覆盖 = resolvePolishStyle，否则 = 覆盖值） */
  effectiveStyle: PolishStyleId
}

const AppScenarioCtx = createContext<AppScenarioContextValue | null>(null)

const OVERRIDES_KEY = 'appScenarioOverrides'
const AUTO_ENABLED_KEY = 'appScenarioAutoEnabled'
const ENABLED_RULES_KEY = 'appScenarioEnabledRules'

const ALL_STYLE_IDS: PolishStyleId[] = ['casual', 'standard', 'formal', 'code', 'email', 'note']

function pickEffectiveStyle(
  auto: PolishStyleId,
  overrides: Record<string, PolishStyleId>,
  processName: string | null,
): PolishStyleId {
  if (!processName) return auto
  const o = overrides[processName.toLowerCase()]
  return o ?? auto
}

export function AppScenarioProvider({ children }: { children: ReactNode }) {
  const [activeContext, setActiveContext] = useState<ActiveAppContext | null>(null)
  const [overrides, setOverrides] = useState<Record<string, PolishStyleId>>({})
  const [autoDetectionEnabled, setAutoDetectionEnabledState] = useState(true)
  const [enabledRuleIds, setEnabledRuleIdsState] = useState<PolishStyleId[]>(ALL_STYLE_IDS)

  // Initial load: overrides and settings from store
  useEffect(() => {
    void Promise.all([
      getSetting<Record<string, PolishStyleId>>(OVERRIDES_KEY, {}),
      getSetting<boolean>(AUTO_ENABLED_KEY, true),
      getSetting<PolishStyleId[]>(ENABLED_RULES_KEY, ALL_STYLE_IDS),
    ]).then(([v, enabled, rules]) => {
      if (v && typeof v === 'object') setOverrides(v)
      setAutoDetectionEnabledState(enabled)
      if (rules && Array.isArray(rules)) setEnabledRuleIdsState(rules)
    })
  }, [])

  // Subscribe to foreground-window changes
  useEffect(() => {
    const unlisten = bridge.onActiveAppContext((ctx) => {
      setActiveContext(ctx ?? null)
    })
    // Also pull initial value once (the WinEvent hook may have fired before we subscribed)
    void bridge.getActiveAppContext().then((ctx) => {
      if (ctx) setActiveContext(ctx)
    }).catch(() => { /* ignore */ })
    return () => unlisten()
  }, [])

  const setOverride = useCallback(async (processName: string, style: PolishStyleId | null) => {
    const key = processName.toLowerCase()
    let next: Record<string, PolishStyleId>
    if (style === null || style === 'auto') {
      const { [key]: _, ...rest } = overrides
      next = rest
    } else {
      next = { ...overrides, [key]: style }
    }
    setOverrides(next)
    await setSetting(OVERRIDES_KEY, next)
  }, [overrides])

  const clearAllOverrides = useCallback(async () => {
    setOverrides({})
    await setSetting(OVERRIDES_KEY, {})
  }, [])

  const setAutoDetectionEnabled = useCallback(async (enabled: boolean) => {
    setAutoDetectionEnabledState(enabled)
    await setSetting(AUTO_ENABLED_KEY, enabled)
  }, [])

  const setEnabledRules = useCallback(async (rules: PolishStyleId[]) => {
    setEnabledRuleIdsState(rules)
    await setSetting(ENABLED_RULES_KEY, rules)
  }, [])

  const value = useMemo<AppScenarioContextValue>(() => {
    const resolvedAutoStyle = autoDetectionEnabled ? resolvePolishStyle(activeContext) : 'auto'
    const autoStyle = enabledRuleIds.includes(resolvedAutoStyle) ? resolvedAutoStyle : 'auto'
    const effectiveStyle = pickEffectiveStyle(autoStyle, overrides, activeContext?.processName ?? null)
    return {
      activeContext,
      autoDetectionEnabled,
      enabledRuleIds,
      setAutoDetectionEnabled,
      setEnabledRules,
      resolvedStyle: effectiveStyle,
      overrides,
      setOverride,
      clearAllOverrides,
      meta: POLISH_STYLE_META,
      effectiveStyle,
    }
  }, [activeContext, overrides, setOverride, clearAllOverrides, autoDetectionEnabled, enabledRuleIds, setAutoDetectionEnabled, setEnabledRules])

  return <AppScenarioCtx.Provider value={value}>{children}</AppScenarioCtx.Provider>
}

export function useAppScenario(): AppScenarioContextValue {
  const ctx = useContext(AppScenarioCtx)
  if (!ctx) {
    throw new Error('useAppScenario must be used within <AppScenarioProvider>')
  }
  return ctx
}
