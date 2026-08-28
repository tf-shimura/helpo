import 'server-only'
import { z } from 'zod'
import {
  createErrorResponse,
  createJsonResponse,
  createRequestId,
  getSessionToken,
  requireJson,
  requireOrigin,
  validateWithZod,
} from '../../../../shared/http/http-boundary'
import { getAuthService, getFaqService } from '../services'
import type { Actor } from '../../../../application/auth/types'
import type { Result } from '../../../../shared/http/api-error'

export const runtime = 'nodejs'

const canonicalOrigin = process.env.APP_ORIGIN ?? ''

const faqInputSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
})

async function authenticate(request: Request): Promise<Result<Actor>> {
  const token = getSessionToken(request)
  if (token === null) return { ok: false, error: { kind: 'unauthenticated', code: 'UNAUTHENTICATED' } }
  return getAuthService().authenticate(token)
}

export async function GET(request: Request) {
  const requestId = createRequestId()
  const auth = await authenticate(request)
  if (!auth.ok) return createErrorResponse(auth.error, requestId)
  const items = await getFaqService().list()
  return createJsonResponse({ data: { items } }, 200)
}

export async function POST(request: Request) {
  const requestId = createRequestId()
  const originError = requireOrigin(request, canonicalOrigin)
  if (originError) return createErrorResponse(originError, requestId)

  const auth = await authenticate(request)
  if (!auth.ok) return createErrorResponse(auth.error, requestId)

  const json = await requireJson(request)
  if (!json.ok) return createErrorResponse(json.error, requestId)

  const input = validateWithZod(faqInputSchema, json.value)
  if (!input.ok) return createErrorResponse(input.error, requestId)

  const result = await getFaqService().create(auth.value.role, input.value)
  if (!result.ok) return createErrorResponse(result.error, requestId)
  return createJsonResponse({ data: result.value }, 201)
}
