import 'server-only'
import { Prisma, type PrismaClient } from '../../generated/prisma/client'
import type { Session, SessionRepository, SessionWithAccount } from '../../application/ports'
import type { Result } from '../../shared/http/api-error'
import { mapPrismaError } from './repository-error'

function toSession(model: Prisma.SessionModel): Session {
  return {
    id: model.id,
    tokenHash: model.tokenHash,
    accountId: model.accountId,
    createdAt: model.createdAt,
    expiresAt: model.expiresAt,
    revokedAt: model.revokedAt ?? null,
  }
}

type SessionWithAccountModel = Prisma.SessionGetPayload<{ include: { account: true } }>

function toSessionWithAccount(model: SessionWithAccountModel): SessionWithAccount {
  return {
    ...toSession(model),
    account: {
      id: model.account.id,
      employeeId: model.account.employeeId,
      passwordHash: model.account.passwordHash,
      role: model.account.role as SessionWithAccount['account']['role'],
      failedCount: model.account.failedCount,
      lockedUntil: model.account.lockedUntil ?? null,
    },
  }
}

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    input: Readonly<{ accountId: string; tokenHash: string; expiresAt: Date }>,
  ): Promise<Result<Session>> {
    try {
      const model = await this.prisma.session.create({ data: input })
      return { ok: true, value: toSession(model) }
    } catch (error) {
      return { ok: false, error: mapPrismaError(error) }
    }
  }

  async findByTokenHash(tokenHash: string): Promise<SessionWithAccount | null> {
    const model = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { account: true },
    })
    return model ? toSessionWithAccount(model) : null
  }

  async revoke(sessionId: string, now: Date): Promise<Result<void>> {
    try {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { revokedAt: now },
      })
      return { ok: true, value: undefined }
    } catch (error) {
      return { ok: false, error: mapPrismaError(error, undefined, 'NOT_FOUND') }
    }
  }
}
