import { describe, expect, it } from 'vitest'
import { parseSseStream } from '../../../src/presentation/stream/sse-parser'
import { beginAnswer, reduceAnswerEvent } from '../../../src/presentation/stream/answer-state'

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({ start(controller) { chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk))); controller.close() } })
}

describe('parseSseStream', () => {
  it('UTF-8の分割、CRLF、複数frameを処理する', async () => {
    const events = []
    for await (const event of parseSseStream(streamFrom(['event: start\r\ndata: {"answerId":"a"}\r\n\r\nevent: chunk\r\ndata: {"answerId":"a","sequence":0,"text":"あ"}\r\n\r\nevent: complete\r\ndata: {"answerId":"a","answer":"あ","sources":[]}\r\n\r\n']))) events.push(event)
    expect(events).toEqual([
      { type: 'start', answerId: 'a' },
      { type: 'chunk', answerId: 'a', sequence: 0, text: 'あ' },
      { type: 'complete', answerId: 'a', answer: 'あ', sources: [] },
    ])
  })

  it('不正JSONと終端なしEOFを拒否する', async () => {
    await expect(async () => { for await (const _event of parseSseStream(streamFrom(['event: start\ndata: {bad}\n\n']))) {} }).rejects.toThrow()
    await expect(async () => { for await (const _event of parseSseStream(streamFrom(['event: start\ndata: {"answerId":"a"}\n\n']))) {} }).rejects.toThrow()
  })
})

describe('answer state reducer', () => {
  it('startから連続chunk、completeを受理する', () => {
    let state = beginAnswer()
    state = reduceAnswerEvent(state, { type: 'start', answerId: 'a' })
    state = reduceAnswerEvent(state, { type: 'chunk', answerId: 'a', sequence: 0, text: '回答' })
    state = reduceAnswerEvent(state, { type: 'complete', answerId: 'a', answer: '回答', sources: ['FAQ'] })
    expect(state).toMatchObject({ status: 'completed', text: '回答', sources: ['FAQ'] })
  })

  it('sequence gapとterminal後イベントを失敗にする', () => {
    let state = reduceAnswerEvent(beginAnswer(), { type: 'start', answerId: 'a' })
    state = reduceAnswerEvent(state, { type: 'chunk', answerId: 'a', sequence: 1, text: '欠落' })
    expect(state.status).toBe('failed')
    const completed = reduceAnswerEvent(reduceAnswerEvent(beginAnswer(), { type: 'start', answerId: 'a' }), { type: 'complete', answerId: 'a', answer: '', sources: [] })
    expect(reduceAnswerEvent(completed, { type: 'chunk', answerId: 'a', sequence: 0, text: '後続' }).status).toBe('completed')
  })
})
