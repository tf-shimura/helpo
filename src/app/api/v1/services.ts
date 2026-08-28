import 'server-only'
import { getPrisma } from '../../../infrastructure/db/prisma'
import { PrismaAccountRepository } from '../../../infrastructure/db/account-repository'
import { PrismaSessionRepository } from '../../../infrastructure/db/session-repository'
import { PrismaFaqRepository } from '../../../infrastructure/db/faq-repository'
import { PrismaHistoryRepository } from '../../../infrastructure/db/history-repository'
import { PrismaFeedbackRepository } from '../../../infrastructure/db/feedback-repository'
import { AuthService } from '../../../application/auth/auth-service'
import { FaqService } from '../../../application/faq/faq-service'
import { HistoryService } from '../../../application/history/history-service'
import { FeedbackService } from '../../../application/feedback/feedback-service'
import { AnswerService } from '../../../application/answer/answer-service'
import { OpenAiAnswerProvider } from '../../../infrastructure/ai/openai-answer-provider'
import { SystemClock } from '../../../shared/time/clock'
import { Argon2PasswordVerifier } from '../../../infrastructure/security/argon2-password'
import { RandomSessionTokenizer } from '../../../shared/security/session-token'
import { parseServerConfig } from '../../../shared/config/server-config'

export function getAuthService(): AuthService {
  const prisma = getPrisma()
  return new AuthService(
    new PrismaAccountRepository(prisma),
    new PrismaSessionRepository(prisma),
    new Argon2PasswordVerifier(),
    new RandomSessionTokenizer(),
    new SystemClock(),
  )
}

export function getFaqService(): FaqService {
  return new FaqService(new PrismaFaqRepository(getPrisma()))
}

export function getHistoryService(): HistoryService {
  return new HistoryService(new PrismaHistoryRepository(getPrisma()))
}

export function getFeedbackService(): FeedbackService {
  const historyRepository = new PrismaHistoryRepository(getPrisma())
  return new FeedbackService(historyRepository, new PrismaFeedbackRepository(getPrisma()))
}

export function getAnswerService(): AnswerService {
  const prisma = getPrisma()
  const config = parseServerConfig(process.env)
  return new AnswerService(
    new PrismaFaqRepository(prisma),
    new PrismaHistoryRepository(prisma),
    new OpenAiAnswerProvider({
      apiKey: config.ai.apiKey,
      model: config.ai.model,
      timeoutMs: config.ai.timeoutMs,
    }),
    { faqBudget: 4_000, chunkSize: 100 },
  )
}
