import type { Actor } from '../auth/types'
import type { HistoryRepository } from '../ports'
import type { CompleteHistoryItem, HistoryItem, UnanswerableHistoryItem } from './types'

const unanswerableMessages: Record<string, string> = {
  NO_FAQS: 'FAQが登録されていないため、回答できませんでした。',
  FAQ_BUDGET_EXCEEDED: 'FAQ情報が回答生成の上限を超えています。',
  NO_GROUNDING: '質問に該当する根拠が見つかりませんでした。',
}

export class HistoryService {
  constructor(private readonly historyRepository: HistoryRepository) {}

  async listForActor(actor: Actor): Promise<readonly HistoryItem[]> {
    const histories = await this.historyRepository.listByAccountId(actor.accountId)
    return [...histories]
      .sort((a, b) => b.askedAt.getTime() - a.askedAt.getTime())
      .map((history) => {
      const sources = history.sources.map((source) => ({
        faqId: source.faqId,
        question: source.faqQuestion,
        quote: source.exactQuote,
      }))
      if (history.outcome === 'COMPLETE') {
        const item: CompleteHistoryItem = {
          outcome: 'COMPLETE',
          id: history.id,
          askedAt: history.askedAt,
          question: history.question,
          answer: history.answer ?? '',
          sources,
          feedback: history.feedback,
        }
        return item
      }
      const reason = history.reason ?? 'NO_GROUNDING'
      const item: UnanswerableHistoryItem = {
        outcome: 'UNANSWERABLE',
        id: history.id,
        askedAt: history.askedAt,
        question: history.question,
        reason,
        message: unanswerableMessages[reason] ?? unanswerableMessages.NO_GROUNDING,
        sources: [],
        feedback: null,
      }
      return item
    })
  }
}
