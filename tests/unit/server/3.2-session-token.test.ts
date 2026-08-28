import { describe, expect, it } from 'vitest'
import { RandomSessionTokenizer } from '../../../src/shared/security/session-token'

describe('RandomSessionTokenizer', () => {
  it('32バイトのopaque tokenとSHA-256 hashを生成する', () => {
    const tokenizer = new RandomSessionTokenizer()
    const { rawToken, tokenHash } = tokenizer.generate()
    const decoded = Buffer.from(rawToken.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    expect(decoded.length).toBe(32)
    expect(tokenHash).toBe(tokenizer.hash(rawToken))
    expect(tokenHash).not.toBe(rawToken)
    expect(tokenHash).toHaveLength(43)
  })

  it('毎回異なるtokenを生成する', () => {
    const tokenizer = new RandomSessionTokenizer()
    const first = tokenizer.generate()
    const second = tokenizer.generate()
    expect(first.rawToken).not.toBe(second.rawToken)
    expect(first.tokenHash).not.toBe(second.tokenHash)
  })

  it('hashは一方向で元のtokenを推測できない', () => {
    const tokenizer = new RandomSessionTokenizer()
    const { rawToken, tokenHash } = tokenizer.generate()
    expect(tokenHash).toHaveLength(43)
    expect(tokenHash).not.toContain(rawToken)
  })
})
