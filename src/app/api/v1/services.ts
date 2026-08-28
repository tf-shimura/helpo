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
import { SystemClock } from '../../../shared/time/clock'
import { Argon2PasswordVerifier } from '../../../infrastructure/security/argon2-password'
import { RandomSessionTokenizer } from '../../../shared/security/session-token'

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
