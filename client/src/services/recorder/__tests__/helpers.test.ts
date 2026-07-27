import { describe, it, expect } from 'vitest'
import {
  summarizeAppContext,
  buildStatsAppId,
  isModifierPTTSetting,
  computeProcessingTimeoutMs,
  resolvePolishStyle,
  POLISH_STYLE_META,
} from '../helpers'

describe('summarizeAppContext', () => {
  it('null 返回 null', () => {
    expect(summarizeAppContext(null)).toBeNull()
  })

  it('提取关键字段', () => {
    const result = summarizeAppContext({
      processName: 'code.exe',
      exePath: 'C:\\Program Files\\Code\\code.exe',
      windowTitle: 'secret-doc.md',
      windowClass: 'Chrome_WidgetWin_1',
      focusClass: 'Chrome_RenderWidgetHostHWND',
      controlType: 'Edit',
    })
    expect(result?.processName).toBe('code.exe')
    expect(result?.windowTitle).toBe('secret-doc.md')
  })
})

describe('buildStatsAppId', () => {
  it('优先使用 processName', () => {
    expect(buildStatsAppId({ processName: 'code.exe' } as any)).toBe('code.exe')
  })

  it('processName 为空时用 exePath 最后一段', () => {
    expect(buildStatsAppId({ exePath: 'C:\\Apps\\notepad.exe' } as any)).toBe('notepad.exe')
  })

  it('都为空时用 promptAppId', () => {
    expect(buildStatsAppId(null, 'my-app')).toBe('my-app')
  })

  it('全部为空返回 unknown', () => {
    expect(buildStatsAppId(null)).toBe('unknown')
  })
})

describe('isModifierPTTSetting', () => {
  it('识别修饰键', () => {
    expect(isModifierPTTSetting('AltLeft')).toBe(true)
    expect(isModifierPTTSetting('ControlRight')).toBe(true)
    expect(isModifierPTTSetting('ShiftLeft')).toBe(true)
  })

  it('非修饰键返回 false', () => {
    expect(isModifierPTTSetting('Space')).toBe(false)
    expect(isModifierPTTSetting('F1')).toBe(false)
    expect(isModifierPTTSetting(undefined)).toBe(false)
  })
})

describe('computeProcessingTimeoutMs', () => {
  it('cloud_api 模式至少 30s', () => {
    const ms = computeProcessingTimeoutMs(1, 'cloud_api')
    expect(ms).toBeGreaterThanOrEqual(30000)
  })

  it('local 模式至少 60s', () => {
    const ms = computeProcessingTimeoutMs(1, 'local')
    expect(ms).toBeGreaterThanOrEqual(60000)
  })

  it('local 模式上限 120s', () => {
    const ms = computeProcessingTimeoutMs(600, 'local')
    expect(ms).toBeLessThanOrEqual(120000)
  })

  it('长音频超时更长', () => {
    const short = computeProcessingTimeoutMs(5, 'cloud_api')
    const long = computeProcessingTimeoutMs(60, 'cloud_api')
    expect(long).toBeGreaterThan(short)
  })

  it('cloud_api 上限 180s', () => {
    const ms = computeProcessingTimeoutMs(600, 'cloud_api')
    expect(ms).toBeLessThanOrEqual(180000)
  })

  it('local 模式 15s 录音超时 ≥ 60s（修复漏字 bug）', () => {
    // 回归：旧实现 15s 录音 → timeout = 30000ms，多段推理超时漏字
    // 新实现：local 15s 录音 → timeout = 60000 + 7500 = 67500ms
    const ms = computeProcessingTimeoutMs(15, 'local')
    expect(ms).toBeGreaterThanOrEqual(60000)
    expect(ms).toBeLessThanOrEqual(75000)
  })
})

describe('resolvePolishStyle (#5 应用场景)', () => {
  const makeCtx = (processName: string, windowTitle = '') =>
    ({ processName, windowTitle, exePath: '', windowClass: '', focusClass: '', controlType: '' } as any)

  it('空 context 返回 auto', () => {
    expect(resolvePolishStyle(null)).toBe('auto')
  })

  it('未知应用返回 auto', () => {
    expect(resolvePolishStyle(makeCtx('mystery_app.exe'))).toBe('auto')
  })

  it('VSCode → code', () => {
    expect(resolvePolishStyle(makeCtx('Code.exe'))).toBe('code')
  })

  it('Cursor / JetBrains IDE → code', () => {
    expect(resolvePolishStyle(makeCtx('Cursor.exe'))).toBe('code')
    expect(resolvePolishStyle(makeCtx('idea64.exe'))).toBe('code')
    expect(resolvePolishStyle(makeCtx('PyCharm'))).toBe('code')
  })

  it('Terminal / iTerm / Windows Terminal → code', () => {
    expect(resolvePolishStyle(makeCtx('WindowsTerminal.exe'))).toBe('code')
    expect(resolvePolishStyle(makeCtx('iTerm.app'))).toBe('code')
    expect(resolvePolishStyle(makeCtx('cmd.exe'))).toBe('code')
  })

  it('Outlook / Foxmail → email (而非 formal)', () => {
    expect(resolvePolishStyle(makeCtx('OUTLOOK.EXE'))).toBe('email')
    expect(resolvePolishStyle(makeCtx('Foxmail.exe'))).toBe('email')
    expect(resolvePolishStyle(makeCtx('Thunderbird'))).toBe('email')
  })

  it('Notion / Obsidian / Typora → note', () => {
    expect(resolvePolishStyle(makeCtx('Notion.exe'))).toBe('note')
    expect(resolvePolishStyle(makeCtx('obsidian.exe'))).toBe('note')
    expect(resolvePolishStyle(makeCtx('Typora.exe'))).toBe('note')
  })

  it('Word / Excel / PowerPoint → formal', () => {
    expect(resolvePolishStyle(makeCtx('WINWORD.EXE'))).toBe('formal')
    expect(resolvePolishStyle(makeCtx('EXCEL.EXE'))).toBe('formal')
    expect(resolvePolishStyle(makeCtx('POWERPNT.EXE'))).toBe('formal')
  })

  it('WeChat / Slack / Discord → casual', () => {
    expect(resolvePolishStyle(makeCtx('WeChat.exe'))).toBe('casual')
    expect(resolvePolishStyle(makeCtx('Slack.exe'))).toBe('casual')
    expect(resolvePolishStyle(makeCtx('discord.exe'))).toBe('casual')
  })

  it('优先级：code 早于 email (cursor.exe 不会变 email)', () => {
    expect(resolvePolishStyle(makeCtx('Cursor.exe', 'Inbox - Outlook'))).toBe('code')
  })

  it('windowTitle 也参与匹配 (Slack 标题 "Tencent Meeting" 也会触发 casual)', () => {
    expect(resolvePolishStyle(makeCtx('chrome.exe', 'Slack - 腾讯会议'))).toBe('casual')
  })

  it('元数据完整', () => {
    expect(Object.keys(POLISH_STYLE_META)).toEqual(
      expect.arrayContaining(['auto', 'casual', 'standard', 'formal', 'code', 'email', 'note']),
    )
    for (const id of ['auto', 'casual', 'code', 'email', 'note', 'formal', 'standard'] as const) {
      expect(POLISH_STYLE_META[id]).toMatchObject({ id, label: expect.any(String), desc: expect.any(String), icon: expect.any(String) })
    }
  })
})
