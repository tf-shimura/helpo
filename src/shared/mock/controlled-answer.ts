export type AnswerStatus = 'pending' | 'streaming' | 'completed' | 'unavailable' | 'failed' | 'aborted'
export type AnswerOutcome = 'completed' | 'unavailable' | 'failed'

export type AnswerSnapshot = {
  status: AnswerStatus
  text: string
  sources: string[]
}

export class ControlledAnswer {
  private status: AnswerStatus = 'pending'
  private text = ''
  private chunkIndex = 0

  constructor(
    private readonly chunks: readonly string[],
    private readonly completedSources: readonly string[] = [],
    private readonly outcome: AnswerOutcome = 'completed',
  ) {}

  snapshot(): AnswerSnapshot {
    return {
      status: this.status,
      text: this.text,
      sources: this.status === 'completed' ? [...this.completedSources] : [],
    }
  }

  advance(): void {
    this.ensureActive()
    if (this.chunkIndex >= this.chunks.length) return
    this.text += this.chunks[this.chunkIndex]
    this.chunkIndex += 1
    this.status = 'streaming'
  }

  complete(): void {
    this.ensureActive()
    while (this.chunkIndex < this.chunks.length) this.advance()
    this.status = 'completed'
  }

  settle(): void {
    if (this.outcome === 'unavailable') this.markUnavailable()
    else if (this.outcome === 'failed') this.fail()
    else this.complete()
  }

  markUnavailable(): void {
    this.ensureActive()
    this.text = ''
    this.status = 'unavailable'
  }

  fail(): void {
    this.ensureActive()
    this.status = 'failed'
  }

  abort(): void {
    this.ensureActive()
    this.status = 'aborted'
  }

  private ensureActive(): void {
    if (this.status === 'completed' || this.status === 'unavailable' || this.status === 'failed' || this.status === 'aborted') {
      throw new Error('確定済みの回答状態は変更できません')
    }
  }
}
