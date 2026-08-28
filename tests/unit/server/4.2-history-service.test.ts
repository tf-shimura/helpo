import { describe, expect, it } from 'vitest'
import { HistoryService } from '../../../src/application/history/history-service'
import type { Actor } from '../../../src/application/auth/types'
import type { AnswerHistory, AnswerSource, Feedback, HistoryRepository, HistoryWithSources } from '../../../src/application/ports'

function makeHistory(
  accountId: string,
  outcome: 'COMPLETE' | 'UNANSWERABLE',
  askedAt: Date,
  feedback: Feedback | null = null,
): HistoryWithSources {
  const history: AnswerHistory = {
    id: `h-${askedAt.getTime()}`,
    accountId,
    question: 'Q',
    outcome,
    answer: outcome === 'COMPLETE' ? 'A' : null,
    reason: outcome === 'UNANSWERABLE' ? 'NO_FAQS' : null,
    askedAt,
  }
  const sources: AnswerSource[] = outcome === 'COMPLETE'
    ? [{ id: 's1', answerId: history.id, faqId: 'f1', faqQuestion: 'FQ', exactQuote: 'quote', ordinal: 0 }]
    : []
  return { ...history, sources, feedback }
}

class FakeHistoryRepository implements HistoryRepository {
  constructor(private readonly data: HistoryWithSources[]) {}

  async listByAccountId(accountId: string): Promise<readonly HistoryWithSources[]> {
    return this.data.filter((item) => item.accountId === accountId)
  }

  async commitComplete(): Promise<never> { throw new Error('not used') }
  async commitUnanswerable(): Promise<never> { throw new Error('not used') }
  async findById(): Promise<null> { return null }
}

describe('HistoryService', () => {
  it('actorの履歴をaskedAt降順で返す', async () => {
    const actor: Actor = { accountId: 'a1', employeeId: 'E001', role: 'EMPLOYEE' }
    const data = [
      makeHistory('a1', 'COMPLETE', new Date('2026-08-27T00:00:00.000Z')),
      makeHistory('a1', 'UNANSWERABLE', new Date('2026-08-28T00:00:00.000Z')),
      makeHistory('a2', 'COMPLETE', new Date('2026-08-29T00:00:00.000Z')),
    ]
    const service = new HistoryService(new FakeHistoryRepository(data))
    const result = await service.listForActor(actor)
    expect(result.length).toBe(2)
    expect(result[0].outcome).toBe('UNANSWERABLE')
    expect(result[1].outcome).toBe('COMPLETE')
  })

  it('回答不能にはmessageと空sourcesを返す', async () => {
    const actor: Actor = { accountId: 'a1', employeeId: 'E001', role: 'EMPLOYEE' }
    const data = [makeHistory('a1', 'UNANSWERABLE', new Date(), null)]
    const service = new HistoryService(new FakeHistoryRepository(data))
    const [item] = await service.listForActor(actor)
    if (item.outcome !== 'UNANSWERABLE') return
    expect(item.message).toBe('FAQが登録されていないため、回答できませんでした。')
    expect(item.sources).toHaveLength(0)
  })

  it('完成回答にはanswerとsources・feedbackを返す', async () => {
    const actor: Actor = { accountId: 'a1', employeeId: 'E001', role: 'EMPLOYEE' }
    const feedback: Feedback = { id: 'fb1', answerId: 'h-1', accountId: 'a1', value: 'GOOD', createdAt: new Date() }
    const data = [makeHistory('a1', 'COMPLETE', new Date('2026-08-28T00:00:00.000Z'), feedback)]
    const service = new HistoryService(new FakeHistoryRepository(data))
    const [item] = await service.listForActor(actor)
    if (item.outcome !== 'COMPLETE') return
    expect(item.answer).toBe('A')
    expect(item.sources[0].quote).toBe('quote')
    expect(item.feedback?.value).toBe('GOOD')
  })
})
