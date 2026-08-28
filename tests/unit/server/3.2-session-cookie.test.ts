import { describe, expect, it } from 'vitest'
import { clearSessionCookie, serializeSessionCookie } from '../../../src/shared/http/session-cookie'

describe('session cookie', () => {
  it('HttpOnly、SameSite=Lax、Path=/、Max-Age=86400 を持つ', () => {
    const cookie = serializeSessionCookie('abc123', false)
    expect(cookie).toContain('helpo_session=abc123')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('Max-Age=86400')
    expect(cookie).not.toContain('Secure')
  })

  it('HTTPS時はSecure属性を付与する', () => {
    const cookie = serializeSessionCookie('abc123', true)
    expect(cookie).toContain('Secure')
  })

  it('クリア用CookieはMax-Age=0で同じ属性を持つ', () => {
    const cookie = clearSessionCookie(false)
    expect(cookie).toContain('helpo_session=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('Max-Age=0')
  })
})
