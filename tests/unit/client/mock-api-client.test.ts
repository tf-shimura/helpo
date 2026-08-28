import { describe, expect, it } from 'vitest'
import { createMockApiClient } from '../../../src/presentation/api/mock-api-client'
import { mapMockError } from '../../../src/presentation/api/mock-error-mapper'
import { ManualClock } from '../../../src/shared/mock/manual-clock'
import { createMockStore } from '../../../src/shared/mock/mock-store'

describe('mock api client', () => {
  it('ログイン、session復元、logoutを提供する', async () => {
    const client = createMockApiClient(createMockStore(new ManualClock()))
    expect((await client.getSession()).ok).toBe(false)
    const login = await client.login('E001', 'employee-pass')
    expect(login).toMatchObject({ ok: true, value: { role: 'employee' } })
    expect((await client.getSession()).ok).toBe(true)
    await client.logout()
    expect((await client.getSession()).ok).toBe(false)
  })

  it('FAQ操作と競合をエラー結果へ変換する', async () => {
    const client = createMockApiClient(createMockStore(new ManualClock()))
    await client.login('A001', 'admin-pass')
    const created = await client.createFaq('質問', '回答')
    expect(created).toMatchObject({ ok: true, value: { question: '質問' } })
    const conflict = await client.createFaq('質問', '別回答')
    expect(conflict).toMatchObject({ ok: false, status: 409, code: 'FAQ_QUESTION_CONFLICT' })
  })
})

describe('mapMockError', () => {
  it('既知のエラーを安全なUI outcomeへ変換する', () => {
    expect(mapMockError({ ok: false, status: 401, code: 'UNAUTHENTICATED', message: 'x' })).toBe('再認証')
    expect(mapMockError({ ok: false, status: 403, code: 'FORBIDDEN', message: 'x' })).toBe('権限拒否')
    expect(mapMockError({ ok: false, status: 409, code: 'FAQ_QUESTION_CONFLICT', message: 'x' })).toBe('再取得')
  })
})
