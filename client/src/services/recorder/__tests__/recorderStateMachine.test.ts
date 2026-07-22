import { describe, it, expect } from 'vitest'
import { isValidTransition, VALID_TRANSITIONS } from '../helpers'

describe('Recorder state machine — isValidTransition', () => {
  describe('合法转移', () => {
    it('idle → recording （PTT 按下）', () => {
      expect(isValidTransition('idle', 'recording')).toBe(true)
    })

    it('recording → processing （PTT 释放，进入 ASR）', () => {
      expect(isValidTransition('recording', 'processing')).toBe(true)
    })

    it('recording → idle （极短录音丢弃 / 主动取消）', () => {
      expect(isValidTransition('recording', 'idle')).toBe(true)
    })

    it('processing → idle （final 到达 / 超时回 idle）', () => {
      expect(isValidTransition('processing', 'idle')).toBe(true)
    })
  })

  describe('非法转移', () => {
    it('idle → processing （不可跳过录音直接处理）', () => {
      expect(isValidTransition('idle', 'processing')).toBe(false)
    })

    it('idle → idle （自我循环禁止）', () => {
      expect(isValidTransition('idle', 'idle')).toBe(false)
    })

    it('recording → recording （自我循环禁止）', () => {
      expect(isValidTransition('recording', 'recording')).toBe(false)
    })

    it('processing → recording （处理中不可再开始新录音）', () => {
      expect(isValidTransition('processing', 'recording')).toBe(false)
    })

    it('processing → processing （处理中不可再次处理）', () => {
      expect(isValidTransition('processing', 'processing')).toBe(false)
    })
  })

  describe('VALID_TRANSITIONS 表完整性', () => {
    it('恰好 4 条合法转移', () => {
      expect(VALID_TRANSITIONS).toHaveLength(4)
    })

    it('所有 from 值属于 3 个状态之一', () => {
      const validFromStates = new Set(['idle', 'recording', 'processing'])
      for (const [from, _to] of VALID_TRANSITIONS) {
        expect(validFromStates.has(from)).toBe(true)
      }
    })

    it('所有 to 值属于 3 个状态之一', () => {
      const validToStates = new Set(['idle', 'recording', 'processing'])
      for (const [_from, to] of VALID_TRANSITIONS) {
        expect(validToStates.has(to)).toBe(true)
      }
    })

    it('不包含自我循环（from === to）', () => {
      for (const [from, to] of VALID_TRANSITIONS) {
        expect(from).not.toBe(to)
      }
    })

    it('覆盖每个 from 状态至少一条出路（除 processing 外）', () => {
      const fromStates = new Set(VALID_TRANSITIONS.map(([f]) => f))
      // 状态机保证：除 processing 终态外，idle / recording 必须有出路
      // processing 永远是终态，final 到达后回 idle（已是合法转移）
      expect(fromStates.has('idle')).toBe(true)
      expect(fromStates.has('recording')).toBe(true)
      expect(fromStates.has('processing')).toBe(true)
    })
  })
})