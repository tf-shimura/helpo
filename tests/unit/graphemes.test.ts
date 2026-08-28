import { describe, expect, it } from 'vitest'
import { countGraphemes, isBlankInput, validateGraphemeLimit, truncateGraphemes } from '../../src/shared/validation/graphemes'

describe('Unicode書記素境界', () => {
  it('複合絵文字、結合文字、改行をそれぞれ1文字として数える', () => {
    expect(countGraphemes('👨‍👩‍👧‍👦')).toBe(1)
    expect(countGraphemes('e\u0301')).toBe(1)
    expect(countGraphemes('\n')).toBe(1)
  })

  it.each([['', true], [' \n\t', true], [' a ', false]])('空白入力 %j を判定する', (value, expected) => {
    expect(isBlankInput(value)).toBe(expected)
  })

  it.each([[0, 400], [1, 400], [400, 400], [0, 1000], [1, 1000], [1000, 1000]])(
    '%i文字を固定上限%i文字以内として保持する',
    (length, limit) => {
      const value = 'あ'.repeat(length)
      expect(truncateGraphemes(value, limit)).toBe(value)
      expect(validateGraphemeLimit(value, limit)).toBe(true)
    },
  )

  it.each([[401, 400], [1001, 1000]])('%i文字を固定上限%i文字へ切り詰め、直接値を拒否する', (length, limit) => {
    const value = 'あ'.repeat(length)
    expect(countGraphemes(truncateGraphemes(value, limit))).toBe(limit)
    expect(validateGraphemeLimit(value, limit)).toBe(false)
  })
})
