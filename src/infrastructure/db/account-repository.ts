import 'server-only'
import { Prisma, type PrismaClient } from '../../generated/prisma/client'
import type { Account, AccountRepository } from '../../application/ports'
import type { Result } from '../../shared/http/api-error'
import { mapPrismaError } from './repository-error'

function toAccount(model: Prisma.AccountModel): Account {
  return {
    id: model.id,
    employeeId: model.employeeId,
    passwordHash: model.passwordHash,
    role: model.role as Account['role'],
    failedCount: model.failedCount,
    lockedUntil: model.lockedUntil ?? null,
  }
}

export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmployeeId(employeeId: string): Promise<Account | null> {
    const model = await this.prisma.account.findUnique({ where: { employeeId } })
    return model ? toAccount(model) : null
  }

  async updateLockState(
    employeeId: string,
    input: Readonly<{ failedCount: number; lockedUntil: Date | null }>,
  ): Promise<Result<Account>> {
    try {
      const model = await this.prisma.account.update({
        where: { employeeId },
        data: {
          failedCount: input.failedCount,
          lockedUntil: input.lockedUntil,
        },
      })
      return { ok: true, value: toAccount(model) }
    } catch (error) {
      return { ok: false, error: mapPrismaError(error, undefined, 'NOT_FOUND') }
    }
  }
}
