import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { AnswerService } from '../../../src/application/answer/answer-service'
import type { FaqRepository, HistoryRepository, Faq } from '../../../src/application/ports'
import type { AnswerEvent, AnswerProvider, ProviderResult, QuestionInput } from '../../../src/application/answer/types'
import { AnswerProviderError } from '../../../src/application/answer/types'
import type { Result } from '../../../src/shared/http/api-error'
import type { AnswerHistory, HistoryWithSources } from '../../../src/application/ports'

async function collect(gen: AsyncIterable<AnswerEvent>): Promise<AnswerEvent[]> {
  const events: AnswerEvent[] = []
  for await (const event of gen) events.push(event)
  return events
}

function makeFaq(id: string, question: string, answer: string): Faq {
  return { id, question, answer, createdAt: new Date(), updatedAt: new Date() }
}

class FakeFaqRepository implements FaqRepository {
  constructor(private readonly data: Faq[]) {}
  async list(): Promise<readonly Faq[]> { return this.data }
  async create(): Promise<never> { throw new Error('not used') }
  async update(): Promise<never> { throw new Error('not used') }
}

class FakeHistoryRepository implements HistoryRepository {
  completeCalls: Parameters<HistoryRepository['commitComplete']>[0][] = []
  unanswerableCalls: Parameters<HistoryRepository['commitUnanswerable']>[0][] = []
  private failNext = false

  setFailNext(): void { this.failNext = true }

  async commitComplete(input: Parameters<HistoryRepository['commitComplete']>[0]): Promise<Result<HistoryWithSources>> {
    this.completeCalls.push(input)
    if (this.failNext) { this.failNext = false; return { ok: false, error: { kind: 'internal', code: 'INTERNAL_ERROR', requestId: randomUUID() } } }
    return {
      ok: true,
      value: {
        id: input.answerId,
        accountId: input.accountId,
        question: input.question,
        outcome: 'COMPLETE',
        answer: input.answer,
        reason: null,
        askedAt: new Date(),
        sources: [],
        feedback: null,
      },
    }
  }

  async commitUnanswerable(input: Parameters<HistoryRepository['commitUnanswerable']>[0]): Promise<Result<AnswerHistory>> {
    this.unanswerableCalls.push(input)
    if (this.failNext) { this.failNext = false; return { ok: false, error: { kind: 'internal', code: 'INTERNAL_ERROR', requestId: randomUUID() } } }
    return {
      ok: true,
      value: {
        id: input.answerId,
        accountId: input.accountId,
        question: input.question,
        outcome: 'UNANSWERABLE',
        answer: null,
        reason: input.reason,
        askedAt: new Date(),
      },
    }
  }

  async listByAccountId(): Promise<never> { throw new Error('not used') }
  async findById(): Promise<null> { return null }
}

class FakeAnswerProvider implements AnswerProvider {
  calls: { question: string; candidateIds: string[] }[] = []
  result: ProviderResult | Error = { kind: 'unanswerable', reason: 'NO_GROUNDING' }

  setResult(result: ProviderResult): void { this.result = result }
  setError(error: Error): void { this.result = error }

  async select(input: { question: string; candidates: readonly { id: string; answer: string }[] }, _signal: AbortSignal): Promise<ProviderResult> {
    this.calls.push({ question: input.question, candidateIds: input.candidates.map((c) => c.id) })
    if (this.result instanceof Error) throw this.result
    return this.result
  }
}

const actor = { accountId: 'a1', employeeId: 'E001', role: 'EMPLOYEE' as const }

describe('AnswerService', () => {
  it('質問が0または400超の書記素なら検証エラー', async () => {
    const service = new AnswerService(new FakeFaqRepository([]), new FakeHistoryRepository(), new FakeAnswerProvider(), { faqBudget: 1000, chunkSize: 50 })
    await expect(collect(service.stream(actor, { question: '' }, new AbortController().signal))).rejects.toMatchObject({ kind: 'validation' })
    await expect(collect(service.stream(actor, { question: 'あ'.repeat(401) }, new AbortController().signal))).rejects.toMatchObject({ kind: 'validation' })
  })

  it('FAQが0件の場合はNO_FAQSで回答不能を保存する', async () => {
    const history = new FakeHistoryRepository()
    const service = new AnswerService(new FakeFaqRepository([]), history, new FakeAnswerProvider(), { faqBudget: 1000, chunkSize: 50 })
    const events = await collect(service.stream(actor, { question: 'Q' }, new AbortController().signal))
    expect(events[0].type).toBe('start')
    const terminal = events[events.length - 1]
    expect(terminal.type).toBe('unanswerable')
    if (terminal.type !== 'unanswerable') return
    expect(terminal.reason).toBe('NO_FAQS')
    expect(history.unanswerableCalls).toHaveLength(1)
    expect(history.unanswerableCalls[0].reason).toBe('NO_FAQS')
  })

  it('FAQ budget超過ならproviderを呼ばずFAQ_BUDGET_EXCEEDEDを保存する', async () => {
    const faqs = [makeFaq('f1', 'Q1', 'a'.repeat(10)), makeFaq('f2', 'Q2', 'b'.repeat(10))]
    const provider = new FakeAnswerProvider()
    provider.setResult({ kind: 'selected', selections: [{ faqId: 'f1', quote: 'aaaaaaaaaa' }] })
    const history = new FakeHistoryRepository()
    const service = new AnswerService(new FakeFaqRepository(faqs), history, provider, { faqBudget: 15, chunkSize: 50 })
    const events = await collect(service.stream(actor, { question: 'Q' }, new AbortController().signal))
    const terminal = events[events.length - 1]
    expect(terminal.type).toBe('unanswerable')
    if (terminal.type !== 'unanswerable') return
    expect(terminal.reason).toBe('FAQ_BUDGET_EXCEEDED')
    expect(provider.calls).toHaveLength(0)
    expect(history.unanswerableCalls[0].reason).toBe('FAQ_BUDGET_EXCEEDED')
  })

  it('上限内なら全候補をproviderへ渡し、完成回答をchunk化して保存する', async () => {
    const faqs = [makeFaq('f1', 'Q1', '0123456789')]
    const provider = new FakeAnswerProvider()
    provider.setResult({ kind: 'selected', selections: [{ faqId: 'f1', quote: '0123456789' }] })
    const history = new FakeHistoryRepository()
    const service = new AnswerService(new FakeFaqRepository(faqs), history, provider, { faqBudget: 100, chunkSize: 4 })
    const events = await collect(service.stream(actor, { question: 'Q' }, new AbortController().signal))
    expect(events[0].type).toBe('start')
    expect(provider.calls[0].candidateIds).toEqual(['f1'])
    const chunks = events.filter((e) => e.type === 'chunk')
    expect(chunks.length).toBeGreaterThan(0)
    const complete = events[events.length - 1]
    expect(complete.type).toBe('complete')
    if (complete.type !== 'complete') return
    expect(complete.answer).toContain('0123456789')
    expect(complete.sources[0].faqId).toBe('f1')
    expect(history.completeCalls).toHaveLength(1)
    expect(history.completeCalls[0].sources[0].exactQuote).toBe('0123456789')
  })

  it('providerが回答不能を返せばNO_GROUNDINGを保存する', async () => {
    const faqs = [makeFaq('f1', 'Q1', 'A1')]
    const provider = new FakeAnswerProvider()
    provider.setResult({ kind: 'unanswerable', reason: 'NO_GROUNDING' })
    const history = new FakeHistoryRepository()
    const service = new AnswerService(new FakeFaqRepository(faqs), history, provider, { faqBudget: 100, chunkSize: 50 })
    const events = await collect(service.stream(actor, { question: 'Q' }, new AbortController().signal))
    const terminal = events[events.length - 1]
    expect(terminal.type).toBe('unanswerable')
    if (terminal.type !== 'unanswerable') return
    expect(terminal.reason).toBe('NO_GROUNDING')
    expect(history.unanswerableCalls[0].reason).toBe('NO_GROUNDING')
  })

  it('grounding検証失敗はGROUNDING_FAILEDで保存しない', async () => {
    const faqs = [makeFaq('f1', 'Q1', 'A1')]
    const provider = new FakeAnswerProvider()
    provider.setResult({ kind: 'selected', selections: [{ faqId: 'f1', quote: 'unknown' }] })
    const history = new FakeHistoryRepository()
    const service = new AnswerService(new FakeFaqRepository(faqs), history, provider, { faqBudget: 100, chunkSize: 50 })
    const events = await collect(service.stream(actor, { question: 'Q' }, new AbortController().signal))
    const terminal = events[events.length - 1]
    expect(terminal.type).toBe('error')
    if (terminal.type !== 'error') return
    expect(terminal.code).toBe('GROUNDING_FAILED')
    expect(terminal.retryable).toBe(false)
    expect(history.completeCalls).toHaveLength(0)
    expect(history.unanswerableCalls).toHaveLength(0)
  })

  it('providerエラーはerrorイベントで保存しない', async () => {
    const faqs = [makeFaq('f1', 'Q1', 'A1')]
    const provider = new FakeAnswerProvider()
    provider.setError(new AnswerProviderError('AI_TIMEOUT', true, 'timeout'))
    const history = new FakeHistoryRepository()
    const service = new AnswerService(new FakeFaqRepository(faqs), history, provider, { faqBudget: 100, chunkSize: 50 })
    const events = await collect(service.stream(actor, { question: 'Q' }, new AbortController().signal))
    const terminal = events[events.length - 1]
    expect(terminal.type).toBe('error')
    if (terminal.type !== 'error') return
    expect(terminal.code).toBe('AI_TIMEOUT')
    expect(history.completeCalls).toHaveLength(0)
    expect(history.unanswerableCalls).toHaveLength(0)
  })

  it('保存失敗はPERSISTENCE_FAILEDを返す', async () => {
    const faqs = [makeFaq('f1', 'Q1', '0123456789')]
    const provider = new FakeAnswerProvider()
    provider.setResult({ kind: 'selected', selections: [{ faqId: 'f1', quote: '0123456789' }] })
    const history = new FakeHistoryRepository()
    history.setFailNext()
    const service = new AnswerService(new FakeFaqRepository(faqs), history, provider, { faqBudget: 100, chunkSize: 4 })
    const events = await collect(service.stream(actor, { question: 'Q' }, new AbortController().signal))
    const terminal = events[events.length - 1]
    expect(terminal.type).toBe('error')
    if (terminal.type !== 'error') return
    expect(terminal.code).toBe('PERSISTENCE_FAILED')
  })

  it('AbortSignalで中断するとterminalを送らない', async () => {
    const faqs = [makeFaq('f1', 'Q1', 'A1')]
    const provider = new FakeAnswerProvider()
    provider.setResult({ kind: 'unanswerable', reason: 'NO_GROUNDING' })
    const controller = new AbortController()
    const stream = serviceStream(faqs, provider, controller.signal)
    const first = await stream.next()
    expect(first.value?.type).toBe('start')
    controller.abort()
    const second = await stream.next()
    expect(second.done).toBe(true)
  })
})

function serviceStream(faqs: Faq[], provider: FakeAnswerProvider, signal: AbortSignal) {
  const service = new AnswerService(new FakeFaqRepository(faqs), new FakeHistoryRepository(), provider, { faqBudget: 100, chunkSize: 50 })
  return service.stream(actor, { question: 'Q' }, signal)[Symbol.asyncIterator]()
}
