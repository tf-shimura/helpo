import type { Result } from '../shared/http/api-error'
export type { Result } from '../shared/http/api-error'

export type Role = 'EMPLOYEE' | 'ADMIN'
export type AnswerOutcome = 'COMPLETE' | 'UNANSWERABLE'
export type FeedbackValue = 'GOOD' | 'BAD'

export type Account = Readonly<{
  id: string
  employeeId: string
  passwordHash: string
  role: Role
  failedCount: number
  lockedUntil: Date | null
}>

export type Session = Readonly<{
  id: string
  tokenHash: string
  accountId: string
  createdAt: Date
  expiresAt: Date
  revokedAt: Date | null
}>

export type SessionWithAccount = Session & Readonly<{ account: Account }>

export type Faq = Readonly<{
  id: string
  question: string
  answer: string
  createdAt: Date
  updatedAt: Date
}>

export type AnswerHistory = Readonly<{
  id: string
  accountId: string
  question: string
  outcome: AnswerOutcome
  answer: string | null
  reason: string | null
  askedAt: Date
}>

export type AnswerSource = Readonly<{
  id: string
  answerId: string
  faqId: string
  faqQuestion: string
  exactQuote: string
  ordinal: number
}>

export type HistoryWithSources = AnswerHistory &
  Readonly<{ sources: readonly AnswerSource[]; feedback: Feedback | null }>

export type Feedback = Readonly<{
  id: string
  answerId: string
  accountId: string
  value: FeedbackValue
  createdAt: Date
}>

export interface AccountRepository {
  findByEmployeeId(employeeId: string): Promise<Account | null>
  updateLockState(
    employeeId: string,
    input: Readonly<{ failedCount: number; lockedUntil: Date | null }>,
  ): Promise<Result<Account>>
}

export interface SessionRepository {
  create(input: Readonly<{ accountId: string; tokenHash: string; expiresAt: Date }>): Promise<Result<Session>>
  findByTokenHash(tokenHash: string): Promise<SessionWithAccount | null>
  revoke(sessionId: string, now: Date): Promise<Result<void>>
}

export interface FaqRepository {
  list(): Promise<readonly Faq[]>
  create(input: Readonly<{ question: string; answer: string }>): Promise<Result<Faq>>
  update(faqId: string, input: Readonly<{ question: string; answer: string }>): Promise<Result<Faq>>
}

export interface HistoryRepository {
  commitComplete(
    input: Readonly<{
      accountId: string
      question: string
      answer: string
      sources: readonly Readonly<{ faqId: string; faqQuestion: string; exactQuote: string; ordinal: number }>[]
    }>,
  ): Promise<Result<HistoryWithSources>>
  commitUnanswerable(
    input: Readonly<{ accountId: string; question: string; reason: string }>,
  ): Promise<Result<AnswerHistory>>
  listByAccountId(accountId: string): Promise<readonly HistoryWithSources[]>
  findById(answerId: string): Promise<AnswerHistory | null>
}

export interface FeedbackRepository {
  create(
    input: Readonly<{ answerId: string; accountId: string; value: FeedbackValue }>,
  ): Promise<Result<Feedback>>
  findByAnswerId(answerId: string): Promise<Feedback | null>
}
