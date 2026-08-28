import type { Actor } from '../auth/types'
import type { AnswerHistory, Feedback, FeedbackRepository, FeedbackValue, HistoryRepository, Result } from '../ports'

export class FeedbackService {
  constructor(
    private readonly historyRepository: HistoryRepository,
    private readonly feedbackRepository: FeedbackRepository,
  ) {}

  async submit(actor: Actor, answerId: string, value: FeedbackValue): Promise<Result<Feedback>> {
    if (value !== 'GOOD' && value !== 'BAD') {
      return { ok: false, error: { kind: 'validation', code: 'VALIDATION_ERROR' } }
    }
    const answer = await this.historyRepository.findById(answerId)
    if (!answer || answer.accountId !== actor.accountId || answer.outcome !== 'COMPLETE') {
      return { ok: false, error: { kind: 'not_found', code: 'NOT_FOUND' } }
    }
    const existing = await this.feedbackRepository.findByAnswerId(answerId)
    if (existing) return { ok: false, error: { kind: 'conflict', code: 'FEEDBACK_CONFLICT' } }
    return this.feedbackRepository.create({ answerId, accountId: actor.accountId, value })
  }
}
