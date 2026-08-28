import { describe, expect, it } from 'vitest'
import { GroundingPolicy } from '../../../src/domain/answer/grounding'
import type { GroundingCandidate, GroundingSelection, GroundingSource } from '../../../src/domain/answer/grounding'

function candidates(): GroundingCandidate[] {
  return [
    { id: 'f1', question: 'Q1', answer: 'A1-answer-line1\nline2' },
    { id: 'f2', question: 'Q2 injection', answer: '<script>alert(1)</script> is not allowed' },
    { id: 'f3', question: 'Q3', answer: 'partial' },
  ]
}

describe('GroundingPolicy', () => {
  it('単一の完全一致引用から回答を構成する', () => {
    const selections: GroundingSelection[] = [{ faqId: 'f1', quote: 'A1-answer-line1\nline2' }]
    const result = GroundingPolicy.build(candidates(), selections)
    expect(result.kind).toBe('complete')
    if (result.kind !== 'complete') return
    expect(result.answer).toContain('A1-answer-line1')
    expect(result.answer).toContain('line2')
    expect(result.sources).toEqual([{ faqId: 'f1', question: 'Q1', quote: 'A1-answer-line1\nline2' }])
  })

  it('複数FAQを順序どおりに配置し重複しない', () => {
    const selections: GroundingSelection[] = [
      { faqId: 'f1', quote: 'line2' },
      { faqId: 'f2', quote: '<script>alert(1)</script>' },
    ]
    const result = GroundingPolicy.build(candidates(), selections)
    expect(result.kind).toBe('complete')
    if (result.kind !== 'complete') return
    expect(result.answer.indexOf('line2')).toBeLessThan(result.answer.indexOf('<script>'))
    expect(result.sources.map((s: GroundingSource) => s.faqId)).toEqual(['f1', 'f2'])
  })

  it('未知のFAQ IDは無効', () => {
    const selections: GroundingSelection[] = [{ faqId: 'unknown', quote: 'x' }]
    expect(GroundingPolicy.build(candidates(), selections).kind).toBe('invalid')
  })

  it('空引用は無効', () => {
    const selections: GroundingSelection[] = [{ faqId: 'f1', quote: '' }]
    expect(GroundingPolicy.build(candidates(), selections).kind).toBe('invalid')
  })

  it('FAQ回答本文の完全一致部分でない引用は無効', () => {
    const selections: GroundingSelection[] = [{ faqId: 'f1', quote: 'line3' }]
    expect(GroundingPolicy.build(candidates(), selections).kind).toBe('invalid')
  })

  it('重複するFAQ IDは無効', () => {
    const selections: GroundingSelection[] = [
      { faqId: 'f1', quote: 'line2' },
      { faqId: 'f1', quote: 'A1-answer-line1' },
    ]
    expect(GroundingPolicy.build(candidates(), selections).kind).toBe('invalid')
  })

  it('選択されていないFAQの内容は回答に含まれない', () => {
    const selections: GroundingSelection[] = [{ faqId: 'f1', quote: 'line2' }]
    const result = GroundingPolicy.build(candidates(), selections)
    expect(result.kind).toBe('complete')
    if (result.kind !== 'complete') return
    expect(result.answer).not.toContain('A2')
    expect(result.answer).not.toContain('partial')
  })

  it('インジェクション文字列は命令として解釈されず、固定テンプレートにそのまま配置される', () => {
    const selections: GroundingSelection[] = [
      { faqId: 'f2', quote: '<script>alert(1)</script>' },
    ]
    const result = GroundingPolicy.build(candidates(), selections)
    expect(result.kind).toBe('complete')
    if (result.kind !== 'complete') return
    expect(result.answer).toContain('<script>alert(1)</script>')
    // タグを実行や削除せず、固定テンプレート内にそのまま含む
    expect(result.answer).toContain('<script>')
  })
})
