import type { MockAnswerEvent } from './sse-parser'

export type MockAnswerState = Readonly<{
  status: 'idle' | 'awaiting-start' | 'streaming' | 'completed' | 'unanswerable' | 'failed' | 'aborted'
  answerId: string | null
  text: string
  sources: readonly string[]
  message: string | null
  retryable: boolean
  nextSequence: number
}>

export const initialAnswerState: MockAnswerState = { status: 'idle', answerId: null, text: '', sources: [], message: null, retryable: false, nextSequence: 0 }

export function reduceAnswerEvent(state: MockAnswerState, event: MockAnswerEvent): MockAnswerState {
  if (state.status === 'completed' || state.status === 'unanswerable' || state.status === 'failed' || state.status === 'aborted') return state
  if (event.type === 'start') {
    if (state.status !== 'awaiting-start' || state.answerId !== null) return failed(state)
    return { ...state, status: 'streaming', answerId: event.answerId }
  }
  if (state.answerId === null || event.answerId !== state.answerId || state.status !== 'streaming') return failed(state)
  if (event.type === 'chunk') {
    if (event.sequence !== state.nextSequence) return failed(state)
    return { ...state, text: state.text + event.text, nextSequence: state.nextSequence + 1 }
  }
  if (event.type === 'complete') return { ...state, status: 'completed', text: event.answer, sources: [...new Set(event.sources)], message: null }
  if (event.type === 'unanswerable') return { ...state, status: 'unanswerable', message: event.message, sources: [] }
  return { ...state, status: 'failed', message: event.message, retryable: event.retryable, sources: [] }
}

export function beginAnswer(): MockAnswerState {
  return { ...initialAnswerState, status: 'awaiting-start' }
}

function failed(state: MockAnswerState): MockAnswerState {
  return { ...state, status: 'failed', message: '回答を取得できませんでした。もう一度お試しください', sources: [] }
}
