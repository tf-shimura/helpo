export type MockAnswerEvent =
  | Readonly<{ type: 'start'; answerId: string }>
  | Readonly<{ type: 'chunk'; answerId: string; sequence: number; text: string }>
  | Readonly<{ type: 'complete'; answerId: string; answer: string; sources: readonly string[] }>
  | Readonly<{ type: 'unanswerable'; answerId: string; reason: string; message: string }>
  | Readonly<{ type: 'error'; answerId: string; code: string; retryable: boolean; message: string }>

const EVENT_TYPES = new Set(['start', 'chunk', 'complete', 'unanswerable', 'error'])

export async function* parseSseStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<MockAnswerEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let terminal = false
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const event = parseFrame(frame)
        if (terminal) throw new Error('終端後にイベントを受信しました')
        terminal = event.type === 'complete' || event.type === 'unanswerable' || event.type === 'error'
        yield event
      }
      if (done) {
        if (buffer.trim()) {
          const event = parseFrame(buffer)
          if (terminal) throw new Error('終端後にイベントを受信しました')
          terminal = event.type === 'complete' || event.type === 'unanswerable' || event.type === 'error'
          yield event
        }
        if (!terminal) throw new Error('終端イベントがありません')
        return
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function parseFrame(frame: string): MockAnswerEvent {
  let eventType = ''
  let data = ''
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith('event:')) eventType = line.slice(6).trim()
    else if (line.startsWith('data:')) data += line.slice(5).trim()
  }
  if (!EVENT_TYPES.has(eventType) || !data) throw new Error('不正なSSEフレームです')
  let payload: unknown
  try { payload = JSON.parse(data) } catch { throw new Error('SSEデータが不正です') }
  if (!isRecord(payload) || typeof payload.answerId !== 'string') throw new Error('SSEイベント項目が不正です')
  if (eventType === 'start') return { type: 'start', answerId: payload.answerId }
  if (eventType === 'chunk' && typeof payload.sequence === 'number' && typeof payload.text === 'string') return { type: 'chunk', answerId: payload.answerId, sequence: payload.sequence, text: payload.text }
  if (eventType === 'complete' && typeof payload.answer === 'string' && Array.isArray(payload.sources) && payload.sources.every((source) => typeof source === 'string')) return { type: 'complete', answerId: payload.answerId, answer: payload.answer, sources: payload.sources }
  if (eventType === 'unanswerable' && typeof payload.reason === 'string' && typeof payload.message === 'string') return { type: 'unanswerable', answerId: payload.answerId, reason: payload.reason, message: payload.message }
  if (eventType === 'error' && typeof payload.code === 'string' && typeof payload.retryable === 'boolean' && typeof payload.message === 'string') return { type: 'error', answerId: payload.answerId, code: payload.code, retryable: payload.retryable, message: payload.message }
  throw new Error('SSEイベント項目が不正です')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
