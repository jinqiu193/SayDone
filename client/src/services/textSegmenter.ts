/**
 * 纯 ASR 文本智能分段
 *
 * **当前实现：默认 no-op（保留原文本不动）。**
 *
 * 设计取舍：用户反馈长 ASR 不应被自动插换行 ——
 *   "它本来就是一段话，为什么要自动换行？"
 * 之前在极速模式下会基于话题转换词插 `\n\n`，
 * 但 250 字强制切、话题词启发式在长录音上经常误判，
 * 把"一段话"切成两段反而更难读。
 *
 * 后续如果需要，可以加一个 `enableAutoSegment` 设置，
 * 默认 OFF，开 ON 时才调用原本的 `segmentAsrTextCore`。
 * 但当下为了不打扰用户，直接返回原文。
 *
 * 保留旧实现的目的是不丢功能代码（万一用户后续反馈想要的话，
 * 把这里一行改成 `return segmentAsrTextCore(text)` 就恢复）。
 */

export function segmentAsrText(text: string): string {
  return text
}

// ─────────────────────────────────────────────────────────────
// 以下为旧实现 `segmentAsrTextCore`，暂未被导出。
// 启用方法：把上面 `return text` 改成 `return segmentAsrTextCore(text)`，
// 然后取消下方声明的 `function` 前缀改 `export`（按需）。
// ─────────────────────────────────────────────────────────────

// 话题转换词（出现在句末标点之后，表示新话题开始）
// 按优先级排列，长词优先匹配
const TOPIC_SHIFT_PHRASES = [
  '第一个', '第二个', '第三个', '第四个', '第五个',
  '第一点', '第二点', '第三点',
  '第一,', '第二,', '第三,',
  '第一，', '第二，', '第三，',
  '首先', '其次',
  '另外呢', '另外,', '另外，', '另外就是', '另外我',
  '还有就是', '还有一个', '还有呢',
  '再就是', '再一个',
  '此外',
  '接下来',
  '最后呢', '最后,', '最后，', '最后就是',
  '总之', '总的来说',
]

// 语气词开头模式：句末标点后跟 "嗯，/呃，/嗯" + 转换信号
const FILLER_THEN_SHIFT = [
  '嗯，所以', '嗯，我觉得', '嗯，我发现',
  '嗯，现在', '嗯，目前', '嗯，如果',
  '嗯，这样', '嗯，还有', '嗯，另外',
  '呃，所以', '呃，我觉得', '呃，然后',
]

const SENTENCE_END_RE = /[。？！]/

function segmentAsrTextCore(text: string): string {
  if (!text || text.length < 40) return text

  const segments: string[] = []
  let currentStart = 0
  let i = 0

  while (i < text.length) {
    if (!SENTENCE_END_RE.test(text[i])) {
      i++
      continue
    }

    const afterPunc = i + 1
    if (afterPunc >= text.length) {
      i++
      continue
    }

    const currentLen = afterPunc - currentStart
    const remaining = text.slice(afterPunc)

    if (currentLen >= 20 && startsWithAny(remaining, TOPIC_SHIFT_PHRASES)) {
      segments.push(text.slice(currentStart, afterPunc))
      currentStart = afterPunc
      i = afterPunc
      continue
    }

    if (currentLen >= 60 && startsWithAny(remaining, FILLER_THEN_SHIFT)) {
      segments.push(text.slice(currentStart, afterPunc))
      currentStart = afterPunc
      i = afterPunc
      continue
    }

    if (currentLen >= 250) {
      segments.push(text.slice(currentStart, afterPunc))
      currentStart = afterPunc
      i = afterPunc
      continue
    }

    i++
  }

  if (currentStart < text.length) {
    segments.push(text.slice(currentStart))
  }

  return segments.join('\n\n')
}

function startsWithAny(text: string, prefixes: string[]): boolean {
  for (const prefix of prefixes) {
    if (text.startsWith(prefix)) return true
  }
  return false
}
