import { access } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { FakeAnswerProvider, FakeProviderMalformedOutputError } from '../../fixtures/fake-answer-provider'
import { FakeClock } from '../../fixtures/fake-clock'
import { createJsonRequest, readTextStream } from '../../fixtures/http'
import { createTestDatabase } from '../../fixtures/test-database'

describe('server test harness', () => {
  it('時刻を決定的に進める', () => {
    const clock = new FakeClock(new Date('2026-01-01T00:00:00.000Z'))
    clock.advanceBy(1_000)
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:01.000Z')
  })

  it('AI結果と呼出入力を外部通信なしで制御する', async () => {
    const provider = new FakeAnswerProvider({ kind: 'unanswerable', reason: 'NO_GROUNDING' })
    const result = await provider.select({ question: '質問', candidates: [] }, new AbortController().signal)
    expect(result).toEqual({ kind: 'unanswerable', reason: 'NO_GROUNDING' })
    expect(provider.calls).toHaveLength(1)
  })

  it('形式不正とprovider障害を決定的に再現する', async () => {
    const provider = new FakeAnswerProvider({ kind: 'unanswerable', reason: 'NO_GROUNDING' })
    provider.setMalformed()
    await expect(provider.select({ question: '質問', candidates: [] }, new AbortController().signal)).rejects.toBeInstanceOf(
      FakeProviderMalformedOutputError,
    )
    provider.setFailure(new Error('provider unavailable'))
    await expect(provider.select({ question: '質問', candidates: [] }, new AbortController().signal)).rejects.toThrow(
      'provider unavailable',
    )
  })

  it('保留中処理のtimeoutまたは切断をAbortSignalで再現する', async () => {
    const provider = new FakeAnswerProvider({ kind: 'unanswerable', reason: 'NO_GROUNDING' })
    const controller = new AbortController()
    provider.setPending()
    const selection = provider.select({ question: '質問', candidates: [] }, controller.signal)
    controller.abort(new Error('timeout'))
    await expect(selection).rejects.toThrow('timeout')
  })

  it('JSON requestと分割streamを扱う', async () => {
    const request = createJsonRequest('http://localhost/api/v1/example', 'POST', { value: '入力' })
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('前'))
        controller.enqueue(new TextEncoder().encode('後'))
        controller.close()
      },
    })
    expect(await request.json()).toEqual({ value: '入力' })
    expect(await readTextStream(stream)).toBe('前後')
  })

  it('testごとにtemporary SQLite URLを作って破棄する', async () => {
    const database = await createTestDatabase()
    expect(database.url).toMatch(/^file:/)
    database.database.exec('CREATE TABLE readiness (id INTEGER PRIMARY KEY)')
    database.database.exec('INSERT INTO readiness DEFAULT VALUES')
    expect(database.database.prepare('SELECT COUNT(*) AS count FROM readiness').get()).toEqual({ count: 1 })
    await expect(access(database.path)).resolves.toBeUndefined()
    await database.dispose()
    await expect(access(database.path)).rejects.toThrow()
  })
})
