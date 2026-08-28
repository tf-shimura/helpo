import type { AnswerEvent } from '../../application/answer/types'

export class SseEncoder {
  private started = false
  private terminated = false
  private nextSequence = 0

  encode(event: AnswerEvent): string {
    if (this.terminated) {
      throw new Error('SSE stream already terminated')
    }

    switch (event.type) {
      case 'start':
        if (this.started) throw new Error('start event already sent')
        this.started = true
        return this.frame('start', event)

      case 'chunk':
        this.assertStarted()
        if (event.sequence !== this.nextSequence) {
          throw new Error(`chunk sequence expected ${this.nextSequence}, received ${event.sequence}`)
        }
        this.nextSequence += 1
        return this.frame('chunk', event)

      case 'complete':
      case 'unanswerable':
      case 'error':
        this.assertStarted()
        this.terminated = true
        return this.frame(event.type, event)

      default:
        throw new Error('unknown answer event type')
    }
  }

  private assertStarted(): void {
    if (!this.started) throw new Error('start event must be sent first')
  }

  private frame(eventName: string, data: unknown): string {
    return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`
  }
}
