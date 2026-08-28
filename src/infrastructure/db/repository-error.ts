import 'server-only'
import { Prisma } from '../../generated/prisma/client'
import { createRequestId, type AppError } from '../../shared/http/api-error'

export function mapPrismaError(
  error: unknown,
  conflictCode?: string,
  notFoundCode = 'NOT_FOUND',
): AppError {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (conflictCode && error.code === 'P2002') {
      return { kind: 'conflict', code: conflictCode }
    }
    if (error.code === 'P2025' || error.code === 'P2003') {
      return { kind: 'not_found', code: notFoundCode }
    }
  }
  return { kind: 'internal', code: 'PERSISTENCE_FAILED', requestId: createRequestId() }
}
