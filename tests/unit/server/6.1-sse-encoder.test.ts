import { describe, expect, it } from 'vitest'
import { SseEncoder } from '../../../src/shared/http/sse'
import type { AnswerEvent } from '../../../src/application/answer/types'

describe('SseEncoder', () => {
  it('startを最初に1回だけ送る', () => {
    const encoder = new SseEncoder()
    const frame = encoder.encode({ type: 'start', answerId: 'a1' })
    expect(frame).toBe('event: start\ndata: {"type":"start","answerId":"a1"}\n\n')
    expect(() => encoder.encode({ type: 'start', answerId: 'a2' })).toThrow('start event already sent')
  })

  it('start前のchunkは拒否', () => {
    const encoder = new SseEncoder()
    expect(() => encoder.encode({ type: 'chunk', answerId: 'a1', sequence: 0, text: 'x' })).toThrow('start event must be sent first')
  })

  it('chunkをsequence 0から連続で送る', () => {
    const encoder = new SseEncoder()
    encoder.encode({ type: 'start', answerId: 'a1' })
    const f0 = encoder.encode({ type: 'chunk', answerId: 'a1', sequence: 0, text: 'hello' })
    const f1 = encoder.encode({ type: 'chunk', answerId: 'a1', sequence: 1, text: 'world' })
    expect(f0).toContain('"sequence":0')
    expect(f1).toContain('"sequence":1')
  })

  it('sequenceがずれると拒否', () => {
    const encoder = new SseEncoder()
    encoder.encode({ type: 'start', answerId: 'a1' })
    encoder.encode({ type: 'chunk', answerId: 'a1', sequence: 0, text: 'x' })
    expect(() => encoder.encode({ type: 'chunk', answerId: 'a1', sequence: 2, text: 'y' })).toThrow('chunk sequence expected 1')
  })

  it('completeをterminalとして送り、後続を拒否', () => {
    const encoder = new SseEncoder()
    encoder.encode({ type: 'start', answerId: 'a1' })
    const frame = encoder.encode({
      type: 'complete',
      answerId: 'a1',
      answer: 'A',
      sources: [{ faqId: 'f1', question: 'Q', quote: 'A' }],
    })
    expect(frame.startsWith('event: complete')).toBe(true)
    expect(() => encoder.encode({ type: 'chunk', answerId: 'a1', sequence: 0, text: 'x' })).toThrow('already terminated')
  })

  it('unanswerableをterminalとして送る', () => {
    const encoder = new SseEncoder()
    encoder.encode({ type: 'start', answerId: 'a1' })
    const frame = encoder.encode({ type: 'unanswerable', answerId: 'a1', reason: 'NO_FAQS', message: 'x' })
    expect(frame.startsWith('event: unanswerable')).toBe(true)
  })

  it('errorをterminalとして送る', () => {
    const encoder = new SseEncoder()
    encoder.encode({ type: 'start', answerId: 'a1' })
    const frame = encoder.encode({ type: 'error', answerId: 'a1', code: 'AI_TIMEOUT', message: 't', retryable: true })
    expect(frame.startsWith('event: error')).toBe(true)
  })

  it('JSON内の改行はエスケープされdata行は1行', () => {
    const encoder = new SseEncoder()
    encoder.encode({ type: 'start', answerId: 'a1' })
    const frame = encoder.encode({ type: 'chunk', answerId: 'a1', sequence: 0, text: 'line1\nline2' })
    const dataLines = frame.split('\n').filter((line) => line.startsWith('data:'))
    expect(dataLines).toHaveLength(1)
    expect(frame).toContain('line1\\nline2')
  })

  it('二重terminalを拒否', () => {
    const encoder = new SseEncoder()
    encoder.encode({ type: 'start', answerId: 'a1' })
    encoder.encode({ type: 'unanswerable', answerId: 'a1', reason: 'NO_FAQS', message: 'x' })
    expect(() => encoder.encode({ type: 'error', answerId: 'a1', code: 'INTERNAL_ERROR', message: 'x', retryable: false })).toThrow('already terminated')
  })
})
