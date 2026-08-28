import 'server-only'
import { z } from 'zod'
import { getPrisma } from '../../../../infrastructure/db/prisma'
import { PrismaAccountRepository } from '../../../../infrastructure/db/account-repository'
import { PrismaSessionRepository } from '../../../../infrastructure/db/session-repository'
import { AuthService } from '../../../../application/auth/auth-service'
import { SystemClock } from '../../../../shared/time/clock'
import { Argon2PasswordVerifier } from '../../../../infrastructure/security/argon2-password'
import { RandomSessionTokenizer } from '../../../../shared/security/session-token'
import { clearSessionCookie, serializeSessionCookie } from '../../../../shared/http/session-cookie'
import {
  createErrorResponse,
  createJsonResponse,
  createRequestId,
  getSessionToken,
  requireJson,
  requireOrigin,
  validateWithZod,
} from '../../../../shared/http/http-boundary'

export const runtime = 'nodejs'

const canonicalOrigin = process.env.APP_ORIGIN ?? ''
const isSecure = canonicalOrigin.startsWith('https://')

const loginSchema = z.object({
  employeeId: z.string().min(1),
  password: z.string().min(1),
})

function getAuthService(): AuthService {
  const prisma = getPrisma()
  return new AuthService(
    new PrismaAccountRepository(prisma),
    new PrismaSessionRepository(prisma),
    new Argon2PasswordVerifier(),
    new RandomSessionTokenizer(),
    new SystemClock(),
  )
}

export async function GET(request: Request) {
  const requestId = createRequestId()
  const token = getSessionToken(request)
  if (token === null) {
    return createErrorResponse({ kind: 'unauthenticated', code: 'UNAUTHENTICATED' }, requestId)
  }
  const result = await getAuthService().authenticate(token)
  if (!result.ok) return createErrorResponse(result.error, requestId)
  return createJsonResponse({ data: result.value }, 200)
}

export async function POST(request: Request) {
  const requestId = createRequestId()
  const originError = requireOrigin(request, canonicalOrigin)
  if (originError) return createErrorResponse(originError, requestId)

  const json = await requireJson(request)
  if (!json.ok) return createErrorResponse(json.error, requestId)

  const input = validateWithZod(loginSchema, json.value)
  if (!input.ok) return createErrorResponse(input.error, requestId)

  const result = await getAuthService().login(input.value)
  if (!result.ok) return createErrorResponse(result.error, requestId)

  const cookie = serializeSessionCookie(result.value.rawToken, isSecure)
  return createJsonResponse({ data: result.value.actor }, 200, { 'Set-Cookie': cookie })
}

export async function DELETE(request: Request) {
  const requestId = createRequestId()
  const originError = requireOrigin(request, canonicalOrigin)
  if (originError) return createErrorResponse(originError, requestId)

  const token = getSessionToken(request)
  if (token === null) {
    return createErrorResponse({ kind: 'unauthenticated', code: 'UNAUTHENTICATED' }, requestId)
  }

  const auth = await getAuthService().authenticate(token)
  if (!auth.ok) return createErrorResponse(auth.error, requestId)

  const logout = await getAuthService().logout(auth.value, token)
  if (!logout.ok) return createErrorResponse(logout.error, requestId)

  const cookie = clearSessionCookie(isSecure)
  return new Response(null, { status: 204, headers: { 'Set-Cookie': cookie } })
}
