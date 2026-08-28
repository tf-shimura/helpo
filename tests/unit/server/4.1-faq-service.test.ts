import { describe, expect, it } from 'vitest'
import { FaqService, type FaqInput } from '../../../src/application/faq/faq-service'
import type { Faq, FaqRepository, Result } from '../../../src/application/ports'

class FakeFaqRepository implements FaqRepository {
  private items: Faq[] = []

  async list(): Promise<readonly Faq[]> {
    return this.items
  }

  async create(input: FaqInput): Promise<Result<Faq>> {
    if (this.items.some((item) => item.question === input.question)) {
      return { ok: false, error: { kind: 'conflict', code: 'FAQ_QUESTION_CONFLICT' } }
    }
    const faq: Faq = {
      id: `faq-${this.items.length + 1}`,
      question: input.question,
      answer: input.answer,
      createdAt: new Date('2026-08-28T00:00:00.000Z'),
      updatedAt: new Date('2026-08-28T00:00:00.000Z'),
    }
    this.items.push(faq)
    return { ok: true, value: faq }
  }

  async update(faqId: string, input: FaqInput): Promise<Result<Faq>> {
    const index = this.items.findIndex((item) => item.id === faqId)
    if (index === -1) return { ok: false, error: { kind: 'not_found', code: 'NOT_FOUND' } }
    if (this.items.some((item, i) => item.question === input.question && i !== index)) {
      return { ok: false, error: { kind: 'conflict', code: 'FAQ_QUESTION_CONFLICT' } }
    }
    const updated: Faq = { ...this.items[index], question: input.question, answer: input.answer, updatedAt: new Date() }
    this.items[index] = updated
    return { ok: true, value: updated }
  }
}

function makeInput(question = '質問', answer = '回答'): FaqInput {
  return { question, answer }
}

describe('FaqService', () => {
  it('認証済み全roleがFAQ一覧を取得できる', async () => {
    const repo = new FakeFaqRepository()
    const service = new FaqService(repo)
    await service.create('ADMIN', makeInput('Q1', 'A1'))
    expect((await service.list()).length).toBe(1)
    expect((await service.list())[0].question).toBe('Q1')
  })

  it('管理者がFAQを登録できる', async () => {
    const service = new FaqService(new FakeFaqRepository())
    const result = await service.create('ADMIN', makeInput('質問1', '回答1'))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.question).toBe('質問1')
      expect(result.value.answer).toBe('回答1')
    }
  })

  it('一般社員はFAQ登録・修正を拒否される', async () => {
    const service = new FaqService(new FakeFaqRepository())
    const create = await service.create('EMPLOYEE', makeInput())
    expect(create.ok).toBe(false)
    if (!create.ok) expect(create.error.kind).toBe('forbidden')
    const update = await service.update('EMPLOYEE', 'x', makeInput())
    expect(update.ok).toBe(false)
    if (!update.ok) expect(update.error.kind).toBe('forbidden')
  })

  it('空白・1001書記素を超える入力を拒否する', async () => {
    const service = new FaqService(new FakeFaqRepository())
    const blank = await service.create('ADMIN', makeInput('   ', '回答'))
    expect(blank.ok).toBe(false)
    if (!blank.ok) expect(blank.error.kind).toBe('validation')

    const long = await service.create('ADMIN', { question: '質問', answer: 'a'.repeat(1001) })
    expect(long.ok).toBe(false)
    if (!long.ok) expect(long.error.kind).toBe('validation')
  })

  it('質問完全一致で競合を返す', async () => {
    const service = new FaqService(new FakeFaqRepository())
    await service.create('ADMIN', makeInput('同じ'))
    const duplicate = await service.create('ADMIN', makeInput('同じ', '別回答'))
    expect(duplicate.ok).toBe(false)
    if (!duplicate.ok) expect(duplicate.error.code).toBe('FAQ_QUESTION_CONFLICT')
  })

  it('存在しないFAQ修正はnot_found', async () => {
    const service = new FaqService(new FakeFaqRepository())
    const result = await service.update('ADMIN', 'unknown', makeInput())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('not_found')
  })
})
