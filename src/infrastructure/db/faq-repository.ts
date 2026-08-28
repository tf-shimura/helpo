import 'server-only'
import { Prisma, type PrismaClient } from '../../generated/prisma/client'
import type { Faq, FaqRepository } from '../../application/ports'
import type { Result } from '../../shared/http/api-error'
import { mapPrismaError } from './repository-error'

function toFaq(model: Prisma.FaqModel): Faq {
  return {
    id: model.id,
    question: model.question,
    answer: model.answer,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  }
}

export class PrismaFaqRepository implements FaqRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(): Promise<readonly Faq[]> {
    const models = await this.prisma.faq.findMany({ orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }] })
    return models.map(toFaq)
  }

  async create(input: Readonly<{ question: string; answer: string }>): Promise<Result<Faq>> {
    try {
      const model = await this.prisma.faq.create({ data: input })
      return { ok: true, value: toFaq(model) }
    } catch (error) {
      return { ok: false, error: mapPrismaError(error, 'FAQ_QUESTION_CONFLICT') }
    }
  }

  async update(
    faqId: string,
    input: Readonly<{ question: string; answer: string }>,
  ): Promise<Result<Faq>> {
    try {
      const model = await this.prisma.faq.update({
        where: { id: faqId },
        data: input,
      })
      return { ok: true, value: toFaq(model) }
    } catch (error) {
      return { ok: false, error: mapPrismaError(error, 'FAQ_QUESTION_CONFLICT') }
    }
  }
}
