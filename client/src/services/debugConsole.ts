// 开发期 console 辅助：生产环境（vite build）会被 dead-code elimination 移除，
// 避免热路径上的 stringification 性能损耗与生产控制台噪音。
//
// 用法：
//   import { devLog, devWarn, devError } from './debugConsole'
//   devLog('[overlay]', 'state:listening (start)')  // 形参形式不会运行 stringify
//
// 行为：
//   - DEV build：转发到 console.*（带原前缀，方便识别）
//   - PROD build：函数体为空，Vite/Rollup tree-shake 后零成本

import { addRuntimeEvent } from './debugLog'

const isDev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true

function fmt(prefix: string, args: unknown[]): unknown[] {
  return [prefix, ...args]
}

/** 开发期 log（生产期 = no-op） */
export function devLog(prefix: string, ...args: unknown[]) {
  if (!isDev) return
  console.log(...fmt(prefix, args))
}

/** 开发期 warn（生产期 = no-op） */
export function devWarn(prefix: string, ...args: unknown[]) {
  if (!isDev) return
  console.warn(...fmt(prefix, args))
}

/** 开发期 error：同时写入 runtime event（保留诊断能力） */
export function devError(prefix: string, ...args: unknown[]) {
  if (!isDev) {
    // 生产环境也记录 error（错误不能丢）
    addRuntimeEvent('error', prefix.replace(/^\[|\]$/g, ''), 'devError', { args: args.map(a => String(a)) })
    return
  }
  console.error(...fmt(prefix, args))
}