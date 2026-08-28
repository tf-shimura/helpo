import 'server-only'
import { z } from 'zod'
import { getAnswerService, getAuthService } from '../services'
import {
  createErrorResponse,
  createRequestId,
  getSessionToken,
  requireJson,
  requireOrigin,
  validateWithZod,
} from '../../../../shared/http/http-boundary'
import { SseEncoder } from '../../../../shared/http/sse'
import { countGraphemes, isBlankInput } from '../../../../shared/text/graphemes'

export const runtime = 'nodejs'

const canonicalOrigin = process.env.APP_ORIGIN ?? ''

const questionSchema = z.object({
  question: z.string().refine(
    (value) => !isBlankInput(value) && countGraphemes(value) >= 1 && countGraphemes(value) <= 400,
    { message: '質問は1〜400文字以内で入力してください' },
  ),
})

function acceptsEventStream(request: Request): boolean {
  const accept = request.headers.get('accept')
  if (accept === null) return false
  const lowered = accept.toLowerCase()
  return lowered.includes('text/event-stream') || lowered === '*/*'
}

export async function POST(request: Request) {
  const requestId = createRequestId()

  const originError = requireOrigin(request, canonicalOrigin)
  if (originError) return createErrorResponse(originError, requestId)

  const token = getSessionToken(request)
  if (token === null) {
    return createErrorResponse({ kind: 'unauthenticated', code: 'UNAUTHENTICATED' }, requestId)
  }
  const auth = await getAuthService().authenticate(token)
  if (!auth.ok) return createErrorResponse(auth.error, requestId)

  if (!acceptsEventStream(request)) {
    return createErrorResponse({ kind: 'not_acceptable', code: 'NOT_ACCEPTABLE' }, requestId)
  }

  const json = await requireJson(request)
  if (!json.ok) return createErrorResponse(json.error, requestId)

  const input = validateWithZod(questionSchema, json.value)
  if (!input.ok) return createErrorResponse(input.error, requestId)

  const abortController = new AbortController()
  const answerService = getAnswerService()

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new SseEncoder()
      try {
        for await (const event of answerService.stream(auth.value, input.value, abortController.signal)) {
          controller.enqueue(new TextEncoder().encode(encoder.encode(event)))
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
    cancel() {
      abortController.abort()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}
