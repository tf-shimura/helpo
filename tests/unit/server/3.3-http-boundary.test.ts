import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  createJsonResponse,
  getSessionToken,
  requireJson,
  requireOrigin,
  validateWithZod,
} from '../../../src/shared/http/http-boundary'
import { toApiError } from '../../../src/shared/http/api-error'

describe('http boundary', () => {
  it('canonical originと完全一致を検証する', () => {
    const request = new Request('http://localhost/api/v1/session', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    })
    expect(requireOrigin(request, 'http://localhost')).toBeNull()
  })

  it('欠落・null・不一致のOriginを拒否する', () => {
    const missing = new Request('http://localhost/api/v1/session', { method: 'POST' })
    expect(requireOrigin(missing, 'http://localhost')).toEqual({
      kind: 'forbidden',
      code: 'ORIGIN_FORBIDDEN',
    })

    const nullOrigin = new Request('http://localhost/api/v1/session', {
      method: 'POST',
      headers: { origin: 'null' },
    })
    expect(requireOrigin(nullOrigin, 'http://localhost')).toEqual({
      kind: 'forbidden',
      code: 'ORIGIN_FORBIDDEN',
    })

    const mismatch = new Request('http://localhost/api/v1/session', {
      method: 'POST',
      headers: { origin: 'http://evil.example' },
    })
    expect(requireOrigin(mismatch, 'http://localhost')).toEqual({
      kind: 'forbidden',
      code: 'ORIGIN_FORBIDDEN',
    })
  })

  it('application/json以外を415とする', async () => {
    const request = new Request('http://localhost/api/v1/session', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    })
    const result = await requireJson(request)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('unsupported_media')
      expect(result.error.code).toBe('UNSUPPORTED_MEDIA_TYPE')
    }
  })

  it('JSON bodyをZodで検証し、field errorを返す', () => {
    const schema = z.object({ name: z.string().min(1) })
    const result = validateWithZod(schema, {})
    expect(result.ok).toBe(false)
    if (!result.ok && result.error.kind === 'validation') {
      expect(result.error.code).toBe('VALIDATION_ERROR')
      expect(result.error.fields?.name).toBeDefined()
    }
  })

  it('Cookieからhelpo_sessionを取得する', () => {
    const request = new Request('http://localhost/api/v1/session', {
      headers: { cookie: 'other=a; helpo_session=abc123; x=y' },
    })
    expect(getSessionToken(request)).toBe('abc123')
  })

  it('locked errorはretryAtを含む', () => {
    const retryAt = new Date('2026-08-28T00:10:00.000Z')
    const { status, body } = toApiError({ kind: 'locked', code: 'LOGIN_LOCKED', retryAt })
    expect(status).toBe(423)
    const error = body.error as { code: string; retryAt: string }
    expect(error.code).toBe('LOGIN_LOCKED')
    expect(error.retryAt).toBe(retryAt.toISOString())
  })

  it('JSON成功レスポンスにenvelopeとContent-Typeを設定する', () => {
    const response = createJsonResponse({ data: { id: '1' } }, 200)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json')
  })
})
