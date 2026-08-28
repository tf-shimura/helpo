import 'server-only'
import { Prisma, type PrismaClient } from '../../generated/prisma/client'
import type { Feedback, FeedbackRepository, FeedbackValue } from '../../application/ports'
import type { Result } from '../../shared/http/api-error'
import { mapPrismaError } from './repository-error'

function toFeedback(model: Prisma.FeedbackModel): Feedback {
  return {
    id: model.id,
    answerId: model.answerId,
    accountId: model.accountId,
    value: model.value as FeedbackValue,
    createdAt: model.createdAt,
  }
}

export class PrismaFeedbackRepository implements FeedbackRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    input: Readonly<{ answerId: string; accountId: string; value: FeedbackValue }>,
  ): Promise<Result<Feedback>> {
    try {
      const model = await this.prisma.feedback.create({ data: input })
      return { ok: true, value: toFeedback(model) }
    } catch (error) {
      return { ok: false, error: mapPrismaError(error, 'FEEDBACK_CONFLICT') }
    }
  }

  async findByAnswerId(answerId: string): Promise<Feedback | null> {
    const model = await this.prisma.feedback.findUnique({ where: { answerId } })
    return model ? toFeedback(model) : null
  }
}
