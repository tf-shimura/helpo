import { describe, expect, it } from 'vitest'
import { FeedbackService } from '../../../src/application/feedback/feedback-service'
import type { Actor } from '../../../src/application/auth/types'
import type { AnswerHistory, Feedback, FeedbackRepository, FeedbackValue, HistoryRepository, Result } from '../../../src/application/ports'

function makeAnswer(accountId: string, outcome: 'COMPLETE' | 'UNANSWERABLE', id: string): AnswerHistory {
  return {
    id,
    accountId,
    question: 'Q',
    outcome,
    answer: outcome === 'COMPLETE' ? 'A' : null,
    reason: outcome === 'UNANSWERABLE' ? 'NO_FAQS' : null,
    askedAt: new Date(),
  }
}

class FakeHistoryRepository implements HistoryRepository {
  constructor(private readonly answers: AnswerHistory[]) {}

  async findById(answerId: string): Promise<AnswerHistory | null> {
    return this.answers.find((a) => a.id === answerId) ?? null
  }

  async listByAccountId(): Promise<never> { throw new Error('not used') }
  async commitComplete(): Promise<never> { throw new Error('not used') }
  async commitUnanswerable(): Promise<never> { throw new Error('not used') }
}

class FakeFeedbackRepository implements FeedbackRepository {
  private items: Feedback[] = []

  async create(input: { answerId: string; accountId: string; value: FeedbackValue }): Promise<Result<Feedback>> {
    const feedback: Feedback = { id: 'fb1', ...input, createdAt: new Date() }
    this.items.push(feedback)
    return { ok: true, value: feedback }
  }

  async findByAnswerId(answerId: string): Promise<Feedback | null> {
    return this.items.find((item) => item.answerId === answerId) ?? null
  }
}

describe('FeedbackService', () => {
  it('完成回答のownerが一回だけ評価できる', async () => {
    const actor: Actor = { accountId: 'a1', employeeId: 'E001', role: 'EMPLOYEE' }
    const history = new FakeHistoryRepository([makeAnswer('a1', 'COMPLETE', 'ans1')])
    const feedback = new FakeFeedbackRepository()
    const service = new FeedbackService(history, feedback)
    const result = await service.submit(actor, 'ans1', 'GOOD')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.value).toBe('GOOD')
  })

  it('2回目はFEEDBACK_CONFLICT', async () => {
    const actor: Actor = { accountId: 'a1', employeeId: 'E001', role: 'EMPLOYEE' }
    const history = new FakeHistoryRepository([makeAnswer('a1', 'COMPLETE', 'ans1')])
    const feedback = new FakeFeedbackRepository()
    const service = new FeedbackService(history, feedback)
    await service.submit(actor, 'ans1', 'GOOD')
    const second = await service.submit(actor, 'ans1', 'BAD')
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.error.code).toBe('FEEDBACK_CONFLICT')
  })

  it('非owner・存在しない・回答不能はNOT_FOUND', async () => {
    const actor: Actor = { accountId: 'a1', employeeId: 'E001', role: 'EMPLOYEE' }
    const history = new FakeHistoryRepository([
      makeAnswer('a2', 'COMPLETE', 'other'),
      makeAnswer('a1', 'UNANSWERABLE', 'unans'),
    ])
    const feedback = new FakeFeedbackRepository()
    const service = new FeedbackService(history, feedback)
    const other = await service.submit(actor, 'other', 'GOOD')
    expect(other.ok).toBe(false)
    if (!other.ok) expect(other.error.kind).toBe('not_found')
    const unans = await service.submit(actor, 'unans', 'GOOD')
    expect(unans.ok).toBe(false)
    if (!unans.ok) expect(unans.error.kind).toBe('not_found')
    const missing = await service.submit(actor, 'missing', 'GOOD')
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.kind).toBe('not_found')
  })

  it('GOOD/BAD以外はVALIDATION_ERROR', async () => {
    const actor: Actor = { accountId: 'a1', employeeId: 'E001', role: 'EMPLOYEE' }
    const service = new FeedbackService(new FakeHistoryRepository([]), new FakeFeedbackRepository())
    const result = await service.submit(actor, 'ans1', 'OK' as FeedbackValue)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('validation')
  })
})
