import { describe, expect, expectTypeOf, it } from 'vitest'
import { createRequestId, toApiError, type AppError, type Result } from '../../../src/shared/http/api-error'
import { countGraphemes, isBlankInput, validateGraphemeLimit } from '../../../src/shared/text/graphemes'
import type { LogMetadata, RedactingLogger } from '../../../src/application/logging/redacting-logger'

describe('server shared boundaries', () => {
  it.each([
    ['', 0],
    ['あ', 1],
    ['👨‍👩‍👧‍👦', 1],
    ['e\u0301', 1],
    ['\n', 1],
    ['あ'.repeat(400), 400],
    ['あ'.repeat(401), 401],
    ['あ'.repeat(1000), 1000],
    ['あ'.repeat(1001), 1001],
  ])('%jを書記素単位で数える', (value, expected) => {
    expect(countGraphemes(value)).toBe(expected)
  })

  it.each([['', true], [' \n\t', true], [' a ', false]])('%jの空白入力を判定する', (value, expected) => {
    expect(isBlankInput(value)).toBe(expected)
  })

  it.each([[400, 400, true], [401, 400, false], [1000, 1000, true], [1001, 1000, false]])(
    '%i書記素を上限%iに対して%sと判定する',
    (length, limit, expected) => expect(validateGraphemeLimit('あ'.repeat(length), limit)).toBe(expected),
  )

  it('判別共用体の結果を要求ID付き標準error envelopeへ変換する', () => {
    const result: Result<never> = { ok: false, error: { kind: 'unauthenticated', code: 'UNAUTHENTICATED' } }
    expect(toApiError(result.error, 'request-safe-id')).toEqual({
      status: 401,
      body: { error: { requestId: 'request-safe-id', code: 'UNAUTHENTICATED', message: '認証が必要です' } },
    })
  })

  it('一意な要求IDを生成する', () => {
    const first = createRequestId()
    const second = createRequestId()
    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    expect(second).not.toBe(first)
  })

  it('内部errorには要求IDだけを含める', () => {
    const error: AppError = { kind: 'internal', code: 'INTERNAL_ERROR', requestId: 'request-safe-id' }
    expect(toApiError(error)).toEqual({
      status: 500,
      body: { error: { requestId: 'request-safe-id', code: 'INTERNAL_ERROR', message: '処理に失敗しました' } },
    })
  })

  it('logger metadataの型は本文や資格情報fieldを持たない', () => {
    type ForbiddenField = Extract<keyof LogMetadata, 'password' | 'token' | 'question' | 'answer' | 'faq' | 'providerBody'>
    expectTypeOf<ForbiddenField>().toEqualTypeOf<never>()
    const unsafeInput = { question: 'secret-marker', answer: 'secret-marker' }
    const metadata: LogMetadata = {
      requestId: 'request-safe-id',
      route: '/api/v1/answers',
      status: 500,
      errorCode: 'INTERNAL_ERROR',
      durationMs: 10,
      providerClassification: 'service_error',
    }
    const entries: LogMetadata[] = []
    const logger: RedactingLogger = {
      info: (entry: LogMetadata) => entries.push(entry),
      error: (entry: LogMetadata) => entries.push(entry),
    }
    logger.error(metadata)
    expect(entries).toEqual([metadata])
    expect(unsafeInput).toMatchObject({ question: 'secret-marker' })
    expect(Object.keys(entries[0])).not.toEqual(expect.arrayContaining(['password', 'token', 'question', 'answer', 'faq']))
    expect(JSON.stringify(entries)).not.toContain('secret-marker')
  })
})
