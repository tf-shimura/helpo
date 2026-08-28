import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { setupClientIntegration, setOpenAiJson, setOpenAiResponse, type Harness } from './harness'
import { PrismaHistoryRepository } from '../../../src/infrastructure/db/history-repository'
import { OpenAiAnswerProvider } from '../../../src/infrastructure/ai/openai-answer-provider'
import { AnswerProviderError } from '../../../src/application/answer/types'

describe('Stream/persistence/disconnect integration matrix', () => {
  let harness: Harness

  beforeEach(async () => {
    setOpenAiJson({ output_text: JSON.stringify({ unanswerable: true }) })
    harness = await setupClientIntegration()
  })

  afterEach(async () => {
    await harness.dispose()
  })

  it('complete後に履歴が確定結果で再取得できる', async () => {
    await harness.client.login({
      employeeId: harness.seeded.employee.employeeId,
      password: harness.seeded.employee.password,
    })

    setOpenAiJson({
      output_text: JSON.stringify({
        selections: [{ faqId: harness.seeded.faq.id, quote: harness.seeded.faq.answer }],
      }),
    })

    const stream = await harness.client.streamAnswer('質問', new AbortController().signal)
    expect(stream.ok).toBe(true)
    if (!stream.ok) return

    let answerId: string | undefined
    for await (const event of stream.value) {
      if (event.type === 'start') answerId = event.answerId
    }
    expect(answerId).toBeDefined()
    if (!answerId) return

    const history = await harness.client.listHistory()
    expect(history.ok).toBe(true)
    if (!history.ok) return
    expect(history.value).toHaveLength(1)
    const item = history.value[0]
    expect(item.id).toBe(answerId)
    expect(item.outcome).toBe('COMPLETE')
    if (item.outcome !== 'COMPLETE') return
    expect(item.answer).toContain(harness.seeded.faq.question)
    expect(item.feedback).toBeNull()
  })

  it('unanswerable後に履歴が回答不能で再取得できる', async () => {
    await harness.client.login({
      employeeId: harness.seeded.employee.employeeId,
      password: harness.seeded.employee.password,
    })

    const stream = await harness.client.streamAnswer('質問', new AbortController().signal)
    expect(stream.ok).toBe(true)
    if (!stream.ok) return

    let answerId: string | undefined
    for await (const event of stream.value) {
      if (event.type === 'start') answerId = event.answerId
    }
    expect(answerId).toBeDefined()
    if (!answerId) return

    const history = await harness.client.listHistory()
    expect(history.ok).toBe(true)
    if (!history.ok) return
    expect(history.value).toHaveLength(1)
    const item = history.value[0]
    expect(item.id).toBe(answerId)
    expect(item.outcome).toBe('UNANSWERABLE')
  })

  it('利用者中断では履歴に追加しない', async () => {
    await harness.client.login({
      employeeId: harness.seeded.employee.employeeId,
      password: harness.seeded.employee.password,
    })

    const controller = new AbortController()
    controller.abort()
    const stream = await harness.client.streamAnswer('質問', controller.signal)
    expect(stream.ok).toBe(false)

    const history = await harness.client.listHistory()
    expect(history.ok).toBe(true)
    if (!history.ok) return
    expect(history.value).toHaveLength(0)
  })

  it('AI_UNAVAILABLEは再試行可能なSSE errorとして履歴に追加しない', async () => {
    await harness.client.login({
      employeeId: harness.seeded.employee.employeeId,
      password: harness.seeded.employee.password,
    })

    setOpenAiResponse(
      new Response(JSON.stringify({ error: 'down' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const stream = await harness.client.streamAnswer('質問', new AbortController().signal)
    expect(stream.ok).toBe(true)
    if (!stream.ok) return

    let errorEvent: { type: 'error'; code: string; retryable: boolean } | undefined
    for await (const event of stream.value) {
      if (event.type === 'error') errorEvent = event
    }
    expect(errorEvent).toBeDefined()
    expect(errorEvent?.code).toBe('AI_UNAVAILABLE')
    expect(errorEvent?.retryable).toBe(true)

    const history = await harness.client.listHistory()
    expect(history.ok).toBe(true)
    if (!history.ok) return
    expect(history.value).toHaveLength(0)
  })

  it('AI_TIMEOUTは再試行可能なSSE errorとして履歴に追加しない', async () => {
    await harness.client.login({
      employeeId: harness.seeded.employee.employeeId,
      password: harness.seeded.employee.password,
    })

    process.env.OPENAI_TIMEOUT_MS = '1000'
    setOpenAiResponse(
      new Promise((resolve) =>
        setTimeout(
          () =>
            resolve(
              new Response(JSON.stringify({ output_text: JSON.stringify({ unanswerable: true }) }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
              }),
            ),
          1100,
        ),
      ),
    )

    const stream = await harness.client.streamAnswer('質問', new AbortController().signal)
    expect(stream.ok).toBe(true)
    if (!stream.ok) return

    let errorEvent: { type: 'error'; code: string; retryable: boolean } | undefined
    for await (const event of stream.value) {
      if (event.type === 'error') errorEvent = event
    }
    expect(errorEvent).toBeDefined()
    expect(errorEvent?.code).toBe('AI_TIMEOUT')
    expect(errorEvent?.retryable).toBe(true)

    const history = await harness.client.listHistory()
    expect(history.ok).toBe(true)
    if (!history.ok) return
    expect(history.value).toHaveLength(0)
  })

  it('GROUNDING_FAILEDは再試行不可能なSSE errorとして履歴に追加しない', async () => {
    await harness.client.login({
      employeeId: harness.seeded.employee.employeeId,
      password: harness.seeded.employee.password,
    })

    setOpenAiJson({ output_text: 'not-json' })

    const stream = await harness.client.streamAnswer('質問', new AbortController().signal)
    expect(stream.ok).toBe(true)
    if (!stream.ok) return

    let errorEvent: { type: 'error'; code: string; retryable: boolean } | undefined
    for await (const event of stream.value) {
      if (event.type === 'error') errorEvent = event
    }
    expect(errorEvent).toBeDefined()
    expect(errorEvent?.code).toBe('GROUNDING_FAILED')
    expect(errorEvent?.retryable).toBe(false)

    const history = await harness.client.listHistory()
    expect(history.ok).toBe(true)
    if (!history.ok) return
    expect(history.value).toHaveLength(0)
  })

  it('PERSISTENCE_FAILEDは再試行可能なSSE errorとして履歴に追加しない', async () => {
    await harness.client.login({
      employeeId: harness.seeded.employee.employeeId,
      password: harness.seeded.employee.password,
    })

    setOpenAiJson({
      output_text: JSON.stringify({
        selections: [{ faqId: harness.seeded.faq.id, quote: harness.seeded.faq.answer }],
      }),
    })

    const spy = vi.spyOn(PrismaHistoryRepository.prototype, 'commitComplete').mockResolvedValue({
      ok: false,
      error: { kind: 'internal', code: 'INTERNAL_ERROR', requestId: randomUUID() },
    })

    const stream = await harness.client.streamAnswer('質問', new AbortController().signal)
    expect(stream.ok).toBe(true)
    if (!stream.ok) return

    let errorEvent: { type: 'error'; code: string; retryable: boolean } | undefined
    for await (const event of stream.value) {
      if (event.type === 'error') errorEvent = event
    }
    spy.mockRestore()
    expect(errorEvent).toBeDefined()
    expect(errorEvent?.code).toBe('PERSISTENCE_FAILED')
    expect(errorEvent?.retryable).toBe(true)

    const history = await harness.client.listHistory()
    expect(history.ok).toBe(true)
    if (!history.ok) return
    expect(history.value).toHaveLength(0)
  })

  it('INTERNAL_ERRORは再試行不可能なSSE errorとして履歴に追加しない', async () => {
    await harness.client.login({
      employeeId: harness.seeded.employee.employeeId,
      password: harness.seeded.employee.password,
    })

    const spy = vi.spyOn(OpenAiAnswerProvider.prototype, 'select').mockRejectedValue(new Error('boom'))

    const stream = await harness.client.streamAnswer('質問', new AbortController().signal)
    expect(stream.ok).toBe(true)
    if (!stream.ok) return

    let errorEvent: { type: 'error'; code: string; retryable: boolean } | undefined
    for await (const event of stream.value) {
      if (event.type === 'error') errorEvent = event
    }
    spy.mockRestore()
    expect(errorEvent).toBeDefined()
    expect(errorEvent?.code).toBe('INTERNAL_ERROR')
    expect(errorEvent?.retryable).toBe(false)

    const history = await harness.client.listHistory()
    expect(history.ok).toBe(true)
    if (!history.ok) return
    expect(history.value).toHaveLength(0)
  })
})
