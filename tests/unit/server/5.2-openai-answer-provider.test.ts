import { describe, expect, it } from 'vitest'
import { OpenAiAnswerProvider } from '../../../src/infrastructure/ai/openai-answer-provider'
import { AnswerProviderError } from '../../../src/application/answer/types'

const config = { apiKey: 'test-key', model: 'gpt-5-nano', timeoutMs: 10_000 }

function makeFetch(body: unknown, status = 200, delayMs = 0) {
  return async (_url: unknown, init?: RequestInit): Promise<Response> => {
    return new Promise((resolve, reject) => {
      const signal = init?.signal
      const onAbort = () => {
        clearTimeout(timeout)
        reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'))
      }
      if (signal?.aborted) {
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
        return
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      const timeout = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve(
          new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
          }),
        )
      }, delayMs)
    })
  }
}

const candidates = [
  { id: 'f1', answer: 'A1' },
  { id: 'f2', answer: 'A2' },
]

describe('OpenAiAnswerProvider', () => {
  it('選択結果をProviderResultへ変換する', async () => {
    const provider = new OpenAiAnswerProvider(
      config,
      makeFetch({ output_text: JSON.stringify({ selections: [{ faqId: 'f1', quote: 'A1' }] }) }),
    )
    const result = await provider.select({ question: 'Q', candidates }, new AbortController().signal)
    expect(result.kind).toBe('selected')
    if (result.kind !== 'selected') return
    expect(result.selections).toEqual([{ faqId: 'f1', quote: 'A1' }])
  })

  it('回答不能を返す', async () => {
    const provider = new OpenAiAnswerProvider(config, makeFetch({ output_text: JSON.stringify({ unanswerable: true }) }))
    const result = await provider.select({ question: 'Q', candidates }, new AbortController().signal)
    expect(result.kind).toBe('unanswerable')
    if (result.kind !== 'unanswerable') return
    expect(result.reason).toBe('NO_GROUNDING')
  })

  it('output_textがJSONでない場合はGROUNDING_FAILED', async () => {
    const provider = new OpenAiAnswerProvider(config, makeFetch({ output_text: 'not-json' }))
    await expect(provider.select({ question: 'Q', candidates }, new AbortController().signal)).rejects.toBeInstanceOf(AnswerProviderError)
    try {
      await provider.select({ question: 'Q', candidates }, new AbortController().signal)
    } catch (error) {
      expect(error).toBeInstanceOf(AnswerProviderError)
      if (error instanceof AnswerProviderError) expect(error.code).toBe('GROUNDING_FAILED')
    }
  })

  it('schema mismatchはGROUNDING_FAILED', async () => {
    const provider = new OpenAiAnswerProvider(
      config,
      makeFetch({ output_text: JSON.stringify({ selections: [{ faqId: 1 }] }) }),
    )
    try {
      await provider.select({ question: 'Q', candidates }, new AbortController().signal)
      expect('should throw').toBe('thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(AnswerProviderError)
      if (error instanceof AnswerProviderError) expect(error.code).toBe('GROUNDING_FAILED')
    }
  })

  it('providerエラーはAI_UNAVAILABLE', async () => {
    const provider = new OpenAiAnswerProvider(config, makeFetch({ error: 'down' }, 503))
    try {
      await provider.select({ question: 'Q', candidates }, new AbortController().signal)
      expect('should throw').toBe('thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(AnswerProviderError)
      if (error instanceof AnswerProviderError) {
        expect(error.code).toBe('AI_UNAVAILABLE')
        expect(error.retryable).toBe(true)
      }
    }
  })

  it('タイムアウトはAI_TIMEOUT', async () => {
    const provider = new OpenAiAnswerProvider(
      { ...config, timeoutMs: 1 },
      makeFetch({ output_text: JSON.stringify({ unanswerable: true }) }, 200, 100),
    )
    try {
      await provider.select({ question: 'Q', candidates }, new AbortController().signal)
      expect('should throw').toBe('thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(AnswerProviderError)
      if (error instanceof AnswerProviderError) {
        expect(error.code).toBe('AI_TIMEOUT')
        expect(error.retryable).toBe(true)
      }
    }
  })

  it('AbortSignalが発火するとAbortErrorを投げる', async () => {
    const provider = new OpenAiAnswerProvider(config, makeFetch({ output_text: JSON.stringify({ unanswerable: true }) }, 200, 20))
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 5)
    await expect(provider.select({ question: 'Q', candidates }, controller.signal)).rejects.toBeTruthy()
  })

  it('リクエストにstore:falseとAuthorizationを含む', async () => {
    let captured: { url: unknown; init: RequestInit } | undefined
    const fetchFn = async (url: unknown, init: RequestInit): Promise<Response> => {
      captured = { url, init }
      return new Response(JSON.stringify({ output_text: JSON.stringify({ unanswerable: true }) }), { status: 200 })
    }
    const provider = new OpenAiAnswerProvider(config, fetchFn as typeof fetch)
    await provider.select({ question: 'Q', candidates }, new AbortController().signal)
    expect(captured).toBeDefined()
    if (!captured) return
    expect((captured.init.headers as Record<string, string>)['Authorization']).toContain('Bearer')
    const body = JSON.parse(captured.init.body as string)
    expect(body.store).toBe(false)
    expect(body.model).toBe('gpt-5-nano')
    expect(body.input).toContain('f1')
  })
})
