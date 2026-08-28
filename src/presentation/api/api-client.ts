import { z } from 'zod'
import { parseSseStream, type MockAnswerEvent } from '../stream/sse-parser'

export type AnswerEvent = MockAnswerEvent

const API_BASE = '/api/v1'

export const HTTP_ERROR_CODES = [
  'VALIDATION_ERROR',
  'INVALID_CREDENTIALS',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'ORIGIN_FORBIDDEN',
  'NOT_FOUND',
  'FAQ_QUESTION_CONFLICT',
  'FEEDBACK_CONFLICT',
  'LOGIN_LOCKED',
  'UNSUPPORTED_MEDIA_TYPE',
  'NOT_ACCEPTABLE',
  'INTERNAL_ERROR',
] as const

export type HttpErrorCode = (typeof HTTP_ERROR_CODES)[number]

const HTTP_ERROR_CODE_SET = new Set<string>(HTTP_ERROR_CODES)

export type ApiFailure = Readonly<{
  ok: false
  status: number
  code: HttpErrorCode | 'UNKNOWN_RESPONSE'
  requestId: string
  message: string
  fields?: Readonly<Record<string, string[]>>
  retryAt?: string
}>

export type ApiResult<T> = Readonly<{ ok: true; value: T }> | ApiFailure

const uuidSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
const dateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/i)

const actorSchema = z
  .object({
    accountId: uuidSchema,
    employeeId: z.string().min(1),
    role: z.enum(['EMPLOYEE', 'ADMIN']),
  })
  .strict()

const sourceSchema = z
  .object({
    faqId: uuidSchema,
    question: z.string().min(1),
    quote: z.string().min(1),
  })
  .strict()

const faqSchema = z
  .object({
    id: uuidSchema,
    question: z.string().min(1),
    answer: z.string().min(1),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
  })
  .strict()

const feedbackSchema = z
  .object({
    id: uuidSchema,
    answerId: uuidSchema,
    value: z.enum(['GOOD', 'BAD']),
    createdAt: dateTimeSchema,
    accountId: uuidSchema.optional(),
  })
  .strict()

const completeHistorySchema = z
  .object({
    id: uuidSchema,
    askedAt: dateTimeSchema,
    question: z.string().min(1),
    outcome: z.literal('COMPLETE'),
    answer: z.string().min(1),
    sources: z.array(sourceSchema),
    feedback: z.union([feedbackSchema, z.literal(null)]),
  })
  .strict()

const unanswerableHistorySchema = z
  .object({
    id: uuidSchema,
    askedAt: dateTimeSchema,
    question: z.string().min(1),
    outcome: z.literal('UNANSWERABLE'),
    reason: z.enum(['NO_FAQS', 'FAQ_BUDGET_EXCEEDED', 'NO_GROUNDING']),
    message: z.string().min(1),
    sources: z.array(sourceSchema).max(0),
    feedback: z.literal(null),
  })
  .strict()

const historySchema = z.union([completeHistorySchema, unanswerableHistorySchema])

export type Actor = z.infer<typeof actorSchema>
export type Source = z.infer<typeof sourceSchema>
export type Faq = z.infer<typeof faqSchema>
export type Feedback = z.infer<typeof feedbackSchema>
export type History = z.infer<typeof historySchema>

const errorObjectSchema = z
  .object({
    requestId: z.string().min(1),
    code: z.string(),
    message: z.string().min(1),
    fields: z.record(z.string(), z.array(z.string().min(1))).optional(),
    retryAt: z.string().optional(),
  })
  .strict()

const errorEnvelopeSchema = z.object({ error: errorObjectSchema }).strict()

function isHttpErrorCode(code: string): code is HttpErrorCode {
  return HTTP_ERROR_CODE_SET.has(code)
}

function unknownResponse(status: number): ApiFailure {
  return {
    ok: false,
    status,
    code: 'UNKNOWN_RESPONSE',
    requestId: 'unknown',
    message: '予期しない応答です',
  }
}

function parseErrorResponse(status: number, raw: unknown): ApiFailure {
  const parsed = errorEnvelopeSchema.safeParse(raw)
  if (!parsed.success) return unknownResponse(status)
  const { requestId, code, message, fields, retryAt } = parsed.data.error
  if (!isHttpErrorCode(code)) return { ok: false, status, code: 'UNKNOWN_RESPONSE', requestId, message }
  if (code !== 'VALIDATION_ERROR' && fields !== undefined) return unknownResponse(status)
  if (code !== 'LOGIN_LOCKED' && retryAt !== undefined) return unknownResponse(status)
  return { ok: false, status, code, requestId, message, fields, retryAt }
}

async function parseJsonResponse<T>(response: Response, schema: z.ZodType<T>): Promise<ApiResult<T>> {
  if (response.status === 204) {
    const noContent = schema.safeParse(undefined)
    return noContent.success
      ? { ok: true, value: noContent.data }
      : unknownResponse(response.status)
  }

  let raw: unknown
  try {
    raw = await response.json()
  } catch {
    return unknownResponse(response.status)
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) return unknownResponse(response.status)
  return { ok: true, value: parsed.data }
}

async function fetchJson<T>(
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const init: RequestInit = {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers,
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, init)
  } catch {
    return unknownResponse(0)
  }

  if (!response.ok) {
    let raw: unknown
    try {
      raw = await response.json()
    } catch {
      return unknownResponse(response.status)
    }
    return parseErrorResponse(response.status, raw)
  }

  return parseJsonResponse(response, schema)
}

const actorEnvelopeSchema = z.object({ data: actorSchema }).strict()
const faqEnvelopeSchema = z.object({ data: faqSchema }).strict()
const faqListEnvelopeSchema = z.object({ data: z.object({ items: z.array(faqSchema) }).strict() }).strict()
const historyListEnvelopeSchema = z.object({ data: z.object({ items: z.array(historySchema) }).strict() }).strict()
const feedbackEnvelopeSchema = z.object({ data: feedbackSchema }).strict()
const noContentSchema = z.undefined()

export interface HelpoApiClient {
  login(input: Readonly<{ employeeId: string; password: string }>): Promise<ApiResult<Actor>>
  getSession(): Promise<ApiResult<Actor>>
  logout(): Promise<ApiResult<void>>
  listFaqs(): Promise<ApiResult<readonly Faq[]>>
  createFaq(input: Readonly<{ question: string; answer: string }>): Promise<ApiResult<Faq>>
  updateFaq(faqId: string, input: Readonly<{ question: string; answer: string }>): Promise<ApiResult<Faq>>
  listHistory(): Promise<ApiResult<readonly History[]>>
  submitFeedback(answerId: string, value: 'GOOD' | 'BAD'): Promise<ApiResult<Feedback>>
  streamAnswer(question: string, signal: AbortSignal): Promise<ApiResult<AsyncIterable<AnswerEvent>>>
}

export function createApiClient(): HelpoApiClient {
  return {
    async login(input) {
      const result = await fetchJson('POST', '/session', actorEnvelopeSchema, input)
      if (!result.ok) return result
      return { ok: true, value: result.value.data }
    },
    async getSession() {
      const result = await fetchJson('GET', '/session', actorEnvelopeSchema)
      if (!result.ok) return result
      return { ok: true, value: result.value.data }
    },
    async logout() {
      return fetchJson('DELETE', '/session', noContentSchema)
    },
    async listFaqs() {
      const result = await fetchJson('GET', '/faqs', faqListEnvelopeSchema)
      if (!result.ok) return result
      return { ok: true, value: result.value.data.items }
    },
    async createFaq(input) {
      const result = await fetchJson('POST', '/faqs', faqEnvelopeSchema, input)
      if (!result.ok) return result
      return { ok: true, value: result.value.data }
    },
    async updateFaq(faqId, input) {
      const result = await fetchJson('PATCH', `/faqs/${encodeURIComponent(faqId)}`, faqEnvelopeSchema, input)
      if (!result.ok) return result
      return { ok: true, value: result.value.data }
    },
    async listHistory() {
      const result = await fetchJson('GET', '/history', historyListEnvelopeSchema)
      if (!result.ok) return result
      return { ok: true, value: result.value.data.items }
    },
    async submitFeedback(answerId, value) {
      const result = await fetchJson('POST', `/answers/${encodeURIComponent(answerId)}/feedback`, feedbackEnvelopeSchema, { value })
      if (!result.ok) return result
      return { ok: true, value: result.value.data }
    },
    async streamAnswer(question, signal) {
      let response: Response
      try {
        response = await fetch(`${API_BASE}/answers`, {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({ question }),
          signal,
        })
      } catch {
        return unknownResponse(0)
      }

      if (!response.ok) {
        let raw: unknown
        try {
          raw = await response.json()
        } catch {
          return unknownResponse(response.status)
        }
        return parseErrorResponse(response.status, raw)
      }

      if (response.body === null) return unknownResponse(response.status)
      return { ok: true, value: parseSseStream(response.body) }
    },
  }
}
