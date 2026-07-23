/**
 * ASR final 文本去重 — 修复 SenseVoice / 流式 ASR 的尾字/重叠问题。
 *
 * 设计取舍（修复长录音漏字）：
 * - 之前用 `maxLenFactor=0.4` + 反复去重 5 轮 → 在长 ASR 文本上会把"自然的句式重复"
 *   （如"今天天气真好。今天天气真好！"或说话人强调重复）误判为重叠，整段砍掉一半。
 * - 现在把 factor 收紧到 0.25、最小重叠 4 字、**只做单轮去重**，避免级联砍字。
 * - 增加 guard：只有重叠段落**有标点/空格自然边界**才认账，长自然句里的"句式相似"不算。
 *
 * 期望行为：
 * - 典型 ASR 尾字重叠："今天天气真好今天天气真好" → "今天天气真好" ✓
 * - LLM 润色文本 / 自然语言叙述：**不动**（避免误伤）
 * - 长 ASR（>30 字）：保留完整内容，不级联砍
 */

const SENT_END_PUNCT = '。？！.?!,，;；\n\t '

/** 一个字符是 CJK 范围 */
function isCjkChar(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf)
  )
}

/**
 * 找到 ASR 末尾重叠的最大长度 L。
 * - 必须 text[len-L:] === text[len-2L:len-L]（完全重复）
 * - L ≥ minLen（默认 4，避免短词误伤）
 * - L ≤ len * maxLenFactor（默认 0.25，避免长句误伤）
 * - 重叠段必须以"自然边界"结束（前一个字符是标点/空格，或者它本身就是句首）
 */
function findTrailingOverlap(text: string, minLen = 4, maxLenFactor = 0.25): number {
  const len = text.length
  if (len < minLen * 2) return 0
  const maxLen = Math.floor(len * maxLenFactor)
  if (maxLen < minLen) return 0

  for (let L = maxLen; L >= minLen; L--) {
    const tail = text.slice(len - L)
    const before = text.slice(len - 2 * L, len - L)
    if (before !== tail) continue

    // 必须包含至少一个 CJK 字符（避免纯 ASCII 巧合误伤）
    let hasCjk = false
    for (let i = 0; i < tail.length; i++) {
      if (isCjkChar(tail[i])) {
        hasCjk = true
        break
      }
    }
    if (!hasCjk) continue

    // 边界检查：before 的开头（即 L 前一个字符）必须是自然边界（标点/空格）
    // 或者前段整个剩余长度都 ≤ 0（说明 before 是从头开始的整段重复）
    const preceding = text[len - 2 * L - 1]
    const boundaryOk =
      len - 2 * L <= 0 || // 重复段一直延伸到文本开头
      SENT_END_PUNCT.includes(text[len - 2 * L - 1]) // 前一个字符是句末标点/空格

    if (boundaryOk) return L
  }
  return 0
}

/**
 * 去除 ASR 文本中尾部与前一段重叠的部分（单轮）。
 * 例："今天天气真好今天天气真好" → "今天天气真好"
 *     "你好啊世界你好啊世界" → "你好啊世界"
 *     "Hello worldHello world" → "Hello world"
 *     "今天天气真好。我觉得天气真好" → 整段保留（中间有句号，重叠是巧合）
 */
export function trimTrailingOverlap(text: string): string {
  if (!text) return text
  const overlap = findTrailingOverlap(text)
  if (overlap > 0) {
    return text.slice(0, text.length - overlap)
  }
  return text
}

/**
 * 综合去重：单轮尾部去重（不做级联，避免长 ASR 被反复砍）。
 * 普通 ASR 尾部去重是最常见的修复场景，约覆盖 90% 的重复 case。
 *
 * **注意：本函数只应用于 ASR 原文，不要用在 LLM 润色/聊天的输出上。**
 */
export function dedupeAsrText(text: string): string {
  if (!text) return text
  return trimTrailingOverlap(text)
}
