import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createApiClient } from '../../../src/presentation/api/api-client'

const employeeActor = {
  accountId: '550e8400-e29b-41d4-a716-446655440001',
  employeeId: 'E001',
  role: 'EMPLOYEE' as const,
}

const adminActor = {
  accountId: '550e8400-e29b-41d4-a716-446655440002',
  employeeId: 'A001',
  role: 'ADMIN' as const,
}

const sampleFaq = {
  id: '550e8400-e29b-41d4-a716-446655440003',
  question: '有給休暇はいつまでに申請すればよいですか？',
  answer: '原則として取得希望日の3営業日前までに勤怠システムから申請してください。',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const sampleFeedback = {
  id: '550e8400-e29b-41d4-a716-446655440004',
  answerId: '550e8400-e29b-41d4-a716-446655440005',
  accountId: '550e8400-e29b-41d4-a716-446655440001',
  value: 'GOOD' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
}

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

describe('api client', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('ログイン成功でActorを返す', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: employeeActor }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const client = createApiClient()
    const result = await client.login({ employeeId: 'E001', password: 'pass' })
    expect(result).toEqual({ ok: true, value: employeeActor })
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/session', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: 'E001', password: 'pass' }),
    })
  })

  it('ログイン失敗でINVALID_CREDENTIALSを返す', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { requestId: 'r', code: 'INVALID_CREDENTIALS', message: 'm' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const client = createApiClient()
    const result = await client.login({ employeeId: 'E001', password: 'wrong' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(401)
    expect(result.code).toBe('INVALID_CREDENTIALS')
  })

  it('getSessionで認証済みActorを返す', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: adminActor }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const client = createApiClient()
    const result = await client.getSession()
    expect(result).toEqual({ ok: true, value: adminActor })
  })

  it('logoutで204をvoidとして返す', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    const client = createApiClient()
    const result = await client.logout()
    expect(result).toEqual({ ok: true, value: undefined })
  })

  it('FAQ一覧を取得する', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { items: [sampleFaq] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const client = createApiClient()
    const result = await client.listFaqs()
    expect(result).toEqual({ ok: true, value: [sampleFaq] })
  })

  it('FAQ登録の競合でFAQ_QUESTION_CONFLICTを返す', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { requestId: 'r', code: 'FAQ_QUESTION_CONFLICT', message: 'm' } }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const client = createApiClient()
    const result = await client.createFaq({ question: 'Q', answer: 'A' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('FAQ_QUESTION_CONFLICT')
  })

  it('評価を送信する', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: sampleFeedback }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const client = createApiClient()
    const result = await client.submitFeedback(sampleFeedback.answerId, 'GOOD')
    expect(result).toEqual({ ok: true, value: sampleFeedback })
  })

  it('回答streamでcompleteイベントを解析する', async () => {
    const sse = [
      'event: start\ndata: {"answerId":"550e8400-e29b-41d4-a716-446655440006"}\n\n',
      'event: chunk\ndata: {"answerId":"550e8400-e29b-41d4-a716-446655440006","sequence":0,"text":"回答"}\n\n',
      'event: complete\ndata: {"answerId":"550e8400-e29b-41d4-a716-446655440006","answer":"回答","sources":[{"faqId":"550e8400-e29b-41d4-a716-446655440003","question":"有給休暇はいつまでに申請すればよいですか？","quote":"原則"}]}\n\n',
    ]
    fetchMock.mockResolvedValue(
      new Response(streamFrom(sse), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    )
    const client = createApiClient()
    const result = await client.streamAnswer('有給休暇', new AbortController().signal)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const events = []
    for await (const event of result.value) events.push(event)
    expect(events).toEqual([
      { type: 'start', answerId: '550e8400-e29b-41d4-a716-446655440006' },
      { type: 'chunk', answerId: '550e8400-e29b-41d4-a716-446655440006', sequence: 0, text: '回答' },
      { type: 'complete', answerId: '550e8400-e29b-41d4-a716-446655440006', answer: '回答', sources: ['有給休暇はいつまでに申請すればよいですか？'] },
    ])
  })

  it('回答streamのpreflight失敗をJSONエラーとして返す', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { requestId: 'r', code: 'VALIDATION_ERROR', message: 'm' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const client = createApiClient()
    const result = await client.streamAnswer('', new AbortController().signal)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(400)
    expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('不正な成功応答はUNKNOWN_RESPONSEとして閉じる', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { invalid: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const client = createApiClient()
    const result = await client.getSession()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('UNKNOWN_RESPONSE')
  })

  it('fetch失敗はUNKNOWN_RESPONSE（status 0）として返す', async () => {
    fetchMock.mockRejectedValue(new Error('network'))
    const client = createApiClient()
    const result = await client.listHistory()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(0)
    expect(result.code).toBe('UNKNOWN_RESPONSE')
  })
})
