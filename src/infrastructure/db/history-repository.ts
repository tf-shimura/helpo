import 'server-only'
import { Prisma, type PrismaClient } from '../../generated/prisma/client'
import type {
  AnswerHistory,
  AnswerSource,
  Feedback,
  FeedbackValue,
  HistoryRepository,
  HistoryWithSources,
} from '../../application/ports'
import type { Result } from '../../shared/http/api-error'
import { mapPrismaError } from './repository-error'

function toAnswerHistory(model: Prisma.AnswerHistoryModel): AnswerHistory {
  return {
    id: model.id,
    accountId: model.accountId,
    question: model.question,
    outcome: model.outcome as AnswerHistory['outcome'],
    answer: model.answer ?? null,
    reason: model.reason ?? null,
    askedAt: model.askedAt,
  }
}

function toAnswerSource(model: Prisma.AnswerSourceModel): AnswerSource {
  return {
    id: model.id,
    answerId: model.answerId,
    faqId: model.faqId,
    faqQuestion: model.faqQuestion,
    exactQuote: model.exactQuote,
    ordinal: model.ordinal,
  }
}

function toFeedback(model: Prisma.FeedbackModel): Feedback {
  return {
    id: model.id,
    answerId: model.answerId,
    accountId: model.accountId,
    value: model.value as FeedbackValue,
    createdAt: model.createdAt,
  }
}

type HistoryWithSourcesModel = Prisma.AnswerHistoryGetPayload<{ include: { sources: true; feedback: true } }>

function toHistoryWithSources(model: HistoryWithSourcesModel): HistoryWithSources {
  return {
    ...toAnswerHistory(model),
    sources: model.sources.map(toAnswerSource),
    feedback: model.feedback ? toFeedback(model.feedback) : null,
  }
}

export class PrismaHistoryRepository implements HistoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async commitComplete(
    input: Readonly<{
      accountId: string
      question: string
      answer: string
      sources: readonly Readonly<{ faqId: string; faqQuestion: string; exactQuote: string; ordinal: number }>[]
    }>,
  ): Promise<Result<HistoryWithSources>> {
    try {
      const sources = input.sources.map((source) => ({
        faqId: source.faqId,
        faqQuestion: source.faqQuestion,
        exactQuote: source.exactQuote,
        ordinal: source.ordinal,
      }))
      const model = (await this.prisma.$transaction(async (tx) => {
        return tx.answerHistory.create({
          data: {
            accountId: input.accountId,
            question: input.question,
            outcome: 'COMPLETE',
            answer: input.answer,
            sources: { create: sources },
          },
          include: { sources: true, feedback: true },
        })
      })) as unknown as HistoryWithSourcesModel
      return { ok: true, value: toHistoryWithSources(model) }
    } catch (error) {
      return { ok: false, error: mapPrismaError(error) }
    }
  }

  async commitUnanswerable(
    input: Readonly<{ accountId: string; question: string; reason: string }>,
  ): Promise<Result<AnswerHistory>> {
    try {
      const model = await this.prisma.answerHistory.create({
        data: {
          accountId: input.accountId,
          question: input.question,
          outcome: 'UNANSWERABLE',
          reason: input.reason,
        },
      })
      return { ok: true, value: toAnswerHistory(model) }
    } catch (error) {
      return { ok: false, error: mapPrismaError(error) }
    }
  }

  async listByAccountId(accountId: string): Promise<readonly HistoryWithSources[]> {
    const models = (await this.prisma.answerHistory.findMany({
      where: { accountId },
      orderBy: { askedAt: 'desc' },
      include: { sources: true, feedback: true },
    })) as unknown as HistoryWithSourcesModel[]
    return models.map(toHistoryWithSources)
  }
}
