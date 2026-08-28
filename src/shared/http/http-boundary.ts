import { z } from 'zod'
import { createRequestId, toApiError } from './api-error'
import type { AppError, Result } from './api-error'

export { createRequestId, toApiError }

export async function requireJson(request: Request): Promise<Result<unknown>> {
  const contentType = request.headers.get('content-type')
  if (contentType === null || !contentType.toLowerCase().startsWith('application/json')) {
    return { ok: false, error: { kind: 'unsupported_media', code: 'UNSUPPORTED_MEDIA_TYPE' } }
  }
  try {
    const data = await request.json()
    return { ok: true, value: data }
  } catch {
    return { ok: false, error: { kind: 'validation', code: 'VALIDATION_ERROR' } }
  }
}

export function validateWithZod<T>(schema: z.ZodSchema<T>, data: unknown): Result<T> {
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    const fields: Record<string, string[]> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'root')
      const messages = fields[key] ?? []
      messages.push(issue.message)
      fields[key] = messages
    }
    return {
      ok: false,
      error: { kind: 'validation', code: 'VALIDATION_ERROR', fields },
    }
  }
  return { ok: true, value: parsed.data }
}

export function getSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === 'helpo_session') return rest.join('=')
  }
  return null
}

export function requireOrigin(request: Request, canonicalOrigin: string): AppError | null {
  const origin = request.headers.get('origin')
  if (origin === null || origin === '' || origin === 'null' || origin !== canonicalOrigin) {
    return { kind: 'forbidden', code: 'ORIGIN_FORBIDDEN' }
  }
  return null
}

export function createJsonResponse(data: unknown, status: 200 | 201, extraHeaders?: HeadersInit): Response {
  const headers: HeadersInit = { 'Content-Type': 'application/json', ...extraHeaders }
  return new Response(JSON.stringify(data), { status, headers })
}

export function createErrorResponse(error: AppError, requestId: string): Response {
  const { status, body } = toApiError(error, requestId)
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
