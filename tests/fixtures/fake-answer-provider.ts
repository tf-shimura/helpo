export type ProviderResult =
  | Readonly<{ kind: 'selected'; selections: readonly Readonly<{ faqId: string; quote: string }>[] }>
  | Readonly<{ kind: 'unanswerable'; reason: 'NO_GROUNDING' }>

export type ProviderInput = Readonly<{
  question: string
  candidates: readonly Readonly<{ id: string; answer: string }>[]
}>

type Behavior =
  | Readonly<{ kind: 'result'; result: ProviderResult }>
  | Readonly<{ kind: 'malformed' }>
  | Readonly<{ kind: 'failure'; error: Error }>
  | Readonly<{ kind: 'pending' }>

export class FakeProviderMalformedOutputError extends Error {}

export class FakeAnswerProvider {
  readonly calls: ProviderInput[] = []
  private behavior: Behavior

  constructor(result: ProviderResult) {
    this.behavior = { kind: 'result', result }
  }

  setResult(result: ProviderResult): void {
    this.behavior = { kind: 'result', result }
  }

  setMalformed(): void {
    this.behavior = { kind: 'malformed' }
  }

  setFailure(error: Error): void {
    this.behavior = { kind: 'failure', error }
  }

  setPending(): void {
    this.behavior = { kind: 'pending' }
  }

  async select(input: ProviderInput, signal: AbortSignal): Promise<ProviderResult> {
    if (signal.aborted) throw signal.reason
    this.calls.push(input)
    if (this.behavior.kind === 'malformed') throw new FakeProviderMalformedOutputError('Malformed provider output')
    if (this.behavior.kind === 'failure') throw this.behavior.error
    if (this.behavior.kind === 'pending') {
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    }
    return this.behavior.result
  }
}
