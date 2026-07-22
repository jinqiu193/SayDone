import { describe, it, expect } from 'vitest'
import { trimTrailingOverlap, dedupeAsrText } from '../asrTextDedup'

describe('trimTrailingOverlap', () => {
  it('空字符串安全', () => {
    expect(trimTrailingOverlap('')).toBe('')
    expect(trimTrailingOverlap(null as unknown as string)).toBe(null)
  })

  it('无重叠不修改', () => {
    expect(trimTrailingOverlap('今天天气真好')).toBe('今天天气真好')
  })

  it('尾部重叠裁掉', () => {
    expect(trimTrailingOverlap('今天天气真好今天天气真好')).toBe('今天天气真好')
  })

  it('英文尾部重叠裁掉', () => {
    expect(trimTrailingOverlap('Hello worldHello world')).toBe('Hello world')
  })

  it('中英混合', () => {
    expect(trimTrailingOverlap('SayDone 很好用SayDone 很好用')).toBe('SayDone 很好用')
  })

  it('三连重复裁掉两段', () => {
    expect(trimTrailingOverlap('ABCABCABC')).toBe('ABC')
  })

  it('太短的文本不动', () => {
    expect(trimTrailingOverlap('啊啊啊')).toBe('啊啊啊')
  })

  it('标点不重叠也通过', () => {
    // 段尾的"啊"重复不应触发（仅一个字符）
    expect(trimTrailingOverlap('我们都要好好的呀呀')).toBe('我们都要好好的呀呀')
  })
})

describe('dedupeAsrText', () => {
  it('应用 trimTrailingOverlap', () => {
    expect(dedupeAsrText('今天天气真好今天天气真好')).toBe('今天天气真好')
  })

  it('正常文本不修改', () => {
    expect(dedupeAsrText('今天天气不错，我觉得可以出门走走。')).toBe('今天天气不错，我觉得可以出门走走。')
  })

  it('空字符串安全', () => {
    expect(dedupeAsrText('')).toBe('')
  })
})
