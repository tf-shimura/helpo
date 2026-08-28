import 'server-only'
import {
  createErrorResponse,
  createJsonResponse,
  createRequestId,
  getSessionToken,
} from '../../../../shared/http/http-boundary'
import { getAuthService, getHistoryService } from '../services'
import type { Actor } from '../../../../application/auth/types'
import type { Result } from '../../../../shared/http/api-error'

export const runtime = 'nodejs'

async function authenticate(request: Request): Promise<Result<Actor>> {
  const token = getSessionToken(request)
  if (token === null) return { ok: false, error: { kind: 'unauthenticated', code: 'UNAUTHENTICATED' } }
  return getAuthService().authenticate(token)
}

export async function GET(request: Request) {
  const requestId = createRequestId()
  const auth = await authenticate(request)
  if (!auth.ok) return createErrorResponse(auth.error, requestId)
  const items = await getHistoryService().listForActor(auth.value)
  return createJsonResponse({ data: { items } }, 200)
}
