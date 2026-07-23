/**
 * RecorderOrchestrator 纯辅助函数
 * 不依赖 this 状态，可独立测试
 */

import type { ActiveAppContext } from '@/types/appContext'

/** 简化 AppContext 用于日志输出 */
export function summarizeAppContext(context: ActiveAppContext | null) {
  if (!context) return null
  return {
    processName: context.processName,
    exePath: context.exePath,
    windowTitle: context.windowTitle,
    windowClass: context.windowClass,
    focusClass: context.focusClass,
    controlType: context.controlType,
    focusedName: context.focusedName,
  }
}

/** 从 AppContext 中提取用于统计的 appId */
export function buildStatsAppId(
  appContext: ActiveAppContext | null,
  promptAppId?: string,
): string {
  const processName = String(appContext?.processName || '').trim()
  if (processName) return processName

  const exePath = String(appContext?.exePath || '').trim()
  if (exePath) {
    const segments = exePath.split(/[\\/]/).filter(Boolean)
    const lastSegment = segments[segments.length - 1]
    if (lastSegment) return lastSegment
  }

  return String(promptAppId || '').trim() || 'unknown'
}

// ─────────────────────────────────────────────────────────────
// 应用场景（#5 自动场景感知）

export type PolishStyleId = 'auto' | 'casual' | 'standard' | 'formal' | 'code' | 'email' | 'note'

export interface PolishStyleMeta {
  id: PolishStyleId
  /** 中文标签 */
  label: string
  /** 简短描述（≤20 字） */
  desc: string
  /** lucide-react 图标名（在 UI 里映射） */
  icon: 'message-circle' | 'type' | 'mail' | 'file-text' | 'code-2' | 'edit-3' | 'sparkles'
}

/** UI 元数据 - 模式指示器 / 设置页使用 */
export const POLISH_STYLE_META: Record<PolishStyleId, PolishStyleMeta> = {
  auto:     { id: 'auto',     label: '自动',     desc: '根据当前焦点应用自动推断',  icon: 'sparkles' },
  casual:   { id: 'casual',   label: '口语',     desc: '聊天/即时通讯 自然口语风',     icon: 'message-circle' },
  standard: { id: 'standard', label: '通用',     desc: '默认书面风格',                 icon: 'type' },
  formal:   { id: 'formal',   label: '正式',     desc: '邮件/合同 严谨书面',           icon: 'edit-3' },
  code:     { id: 'code',     label: '开发',     desc: '保留代码/英文名/技术名词',     icon: 'code-2' },
  email:    { id: 'email',    label: '邮件',     desc: '敬语/落款/段落规范',           icon: 'mail' },
  note:     { id: 'note',     label: '笔记',     desc: 'Notion/Obsidian 等结构化笔记', icon: 'file-text' },
}

/**
 * 根据 processName + windowTitle 自动推断 polishStyle
 * 命中优先级：code > email > note > formal > casual > standard(默认)
 */
export function resolvePolishStyle(context: ActiveAppContext | null): PolishStyleId {
  if (!context?.processName) return 'auto'
  const process = context.processName.toLowerCase()
  const title = (context.windowTitle || '').toLowerCase()
  const combined = process + ' ' + title

  // 1. 开发者类（IDE / 编辑器 / 终端）
  const codePatterns = [
    'code.exe',            // VSCode
    'cursor',              // Cursor
    'jetbrains',           // IntelliJ 家族
    'idea64',
    'idea',
    'pycharm',
    'webstorm',
    'goland',
    'clion',
    'rider',
    'rubymine',
    'phpstorm',
    'androidstudio',
    'sublime_text',        // Sublime
    'notepad++',
    'notepad-plus-plus',
    'vim',
    'nvim',
    'neovim',
    'emacs',
    'xcode',
    'terminal',            // macOS Terminal.app
    'iterm',               // iTerm2
    'windowsterminal',     // Windows Terminal
    'wt.exe',
    'cmd.exe',
    'powershell',
    'fig',
    'warp',
    'rider64',
    'devenv.exe',          // Visual Studio
    'cl.exe',              // VS 编译器不该出现，但兜底
    'hbuilder',
    'hbuildx',
    'webstorm64',
    'rubymine64',
    'clion64',
  ]
  if (codePatterns.some(p => combined.includes(p))) return 'code'

  // 2. 邮件类（重于 "formal"）
  const emailPatterns = [
    'outlook',
    'foxmail',
    'thunderbird',
    'mailbird',
    'mailmate',
    '网易邮箱大师',
    '邮箱大师',
    'qqmail',
    'qq邮箱',
    'spark',               // Spark mail
    'airmail',
  ]
  if (emailPatterns.some(p => combined.includes(p))) return 'email'

  // 3. 笔记类
  const notePatterns = [
    'notion',
    'obsidian',
    'typora',
    'bear',
    'logseq',
    'roam',
    'onenote',
    '印象笔记',
    'evernote',
    'wolai',
    'craft',
    'joplin',
    'zettlr',
    '语雀',
    'yuque',
  ]
  if (notePatterns.some(p => combined.includes(p))) return 'note'

  // 4. 正式书面（文档/演示/表格）
  const formalPatterns = [
    'winword',
    'word.exe',
    'excel.exe',
    'powerpnt',
    'powerpoint',
    'pages',
    'keynote',
    'numbers',
    'acrobat',
    'adobe reader',
    'pdf',
    'wps.exe',
    'wpspdf',
    'kingsoft',
    'libreoffice',
    'soffice',
  ]
  if (formalPatterns.some(p => combined.includes(p))) return 'formal'

  // 5. 聊天/即时通讯（口语）
  const casualPatterns = [
    'wechat',
    'weixin',
    'qq.exe',
    'dingtalk',
    '钉钉',
    '飞书',
    'feishu',
    'lark',
    'slack',
    'discord',
    'telegram',
    'skype',
    'teams',
    'tencent meet',
    '腾讯会议',
    'zoom',
    'google meet',
    '小鱼易连',
    'wemeet',
    '腾讯会议',
  ]
  if (casualPatterns.some(p => combined.includes(p))) return 'casual'

  return 'auto'
}

/** 判断 PTT 设置是否为修饰键 */
export function isModifierPTTSetting(pttSetting?: string): boolean {
  return pttSetting === 'AltLeft'
    || pttSetting === 'AltRight'
    || pttSetting === 'ControlLeft'
    || pttSetting === 'ControlRight'
    || pttSetting === 'ShiftLeft'
    || pttSetting === 'ShiftRight'
}

const PROCESSING_TIMEOUT_BASE_MS = 15_000
const PROCESSING_TIMEOUT_PER_AUDIO_SEC_MS = 500
const PROCESSING_TIMEOUT_MAX_EXTRA_MS = 30_000

/** 根据音频时长和工作模式计算处理超时时间 */
export function computeProcessingTimeoutMs(
  audioDurationSec: number,
  providerMode: string,
): number {
  const safeAudioSec = Number.isFinite(audioDurationSec) ? Math.max(0, audioDurationSec) : 0
  const extraMs = Math.min(
    PROCESSING_TIMEOUT_MAX_EXTRA_MS,
    Math.ceil(safeAudioSec * PROCESSING_TIMEOUT_PER_AUDIO_SEC_MS),
  )
  let timeout = PROCESSING_TIMEOUT_BASE_MS + extraMs

  if (providerMode !== 'server') {
    timeout = Math.max(timeout, 30000)
  }
  if (providerMode === 'cloud_api') {
    const cloudTimeout = 30000 + Math.ceil(safeAudioSec * 500)
    timeout = Math.min(Math.max(timeout, cloudTimeout), 90000)
  }
  return timeout
}

// ─────────────────────────────────────────────────────────────
// Recorder state machine

import type { RecorderState } from './types'

/** 合法状态转移表（from → to） */
export const VALID_TRANSITIONS: ReadonlyArray<readonly [RecorderState, RecorderState]> = [
  ['idle', 'recording'],
  ['recording', 'processing'],
  ['recording', 'idle'],
  ['processing', 'idle'],
] as const

/**
 * 判断 (from, to) 是否是合法状态转移
 *
 * 状态机只允许 4 种合法转换：
 * 1. idle → recording         （PTT 按下 / 开始录音）
 * 2. recording → processing   （PTT 释放 / 停止录音进入 ASR）
 * 3. recording → idle         （极短录音丢弃 / 主动取消）
 * 4. processing → idle        （final 到达 / 超时回 idle）
 *
 * 其他组合一律视为非法（如 idle → processing、recording → recording、idle → idle），
 * 调用方应记 warn 日志并忽略。
 */
export function isValidTransition(
  from: RecorderState,
  to: RecorderState,
): boolean {
  return VALID_TRANSITIONS.some(([f, t]) => f === from && t === to)
}
