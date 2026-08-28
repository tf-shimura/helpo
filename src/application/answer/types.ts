import type { GroundingSelection, GroundingSource } from '../../domain/answer/grounding'

export type QuestionInput = Readonly<{ question: string }>

export type Source = GroundingSource

export type ProviderResult =
  | { kind: 'selected'; selections: readonly GroundingSelection[] }
  | { kind: 'unanswerable'; reason: 'NO_GROUNDING' }

export interface AnswerProvider {
  select(
    input: Readonly<{
      question: string
      candidates: readonly Readonly<{ id: string; answer: string }>[]
    }>,
    signal: AbortSignal,
  ): Promise<ProviderResult>
}

export type AnswerEvent =
  | { type: 'start'; answerId: string }
  | { type: 'chunk'; answerId: string; sequence: number; text: string }
  | { type: 'complete'; answerId: string; answer: string; sources: readonly Source[] }
  | { type: 'unanswerable'; answerId: string; reason: string; message: string }
  | { type: 'error'; answerId: string; code: 'AI_UNAVAILABLE'; message: string; retryable: true }
  | { type: 'error'; answerId: string; code: 'AI_TIMEOUT'; message: string; retryable: true }
  | { type: 'error'; answerId: string; code: 'GROUNDING_FAILED'; message: string; retryable: false }
  | { type: 'error'; answerId: string; code: 'PERSISTENCE_FAILED'; message: string; retryable: true }
  | { type: 'error'; answerId: string; code: 'INTERNAL_ERROR'; message: string; retryable: false }

export class AnswerProviderError extends Error {
  constructor(
    public readonly code: 'AI_UNAVAILABLE' | 'AI_TIMEOUT' | 'GROUNDING_FAILED',
    public readonly retryable: boolean,
    message: string,
  ) {
    super(message)
  }
}
