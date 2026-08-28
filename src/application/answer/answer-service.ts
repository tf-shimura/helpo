import { randomUUID } from 'node:crypto'
import type { AppError } from '../../shared/http/api-error'
import { countGraphemes, isBlankInput, splitGraphemes } from '../../shared/text/graphemes'
import { GroundingPolicy } from '../../domain/answer/grounding'
import type { Actor } from '../auth/types'
import type { Faq, FaqRepository, HistoryRepository } from '../ports'
import type { AnswerEvent, AnswerProvider, QuestionInput } from './types'
import { AnswerProviderError } from './types'

const UNANSWERABLE_MESSAGES: Readonly<Record<string, string>> = {
  NO_FAQS: 'FAQが登録されていないため、回答できませんでした。',
  FAQ_BUDGET_EXCEEDED: 'FAQの内容が多すぎて回答を生成できませんでした。',
  NO_GROUNDING: '質問に該当する根拠が見つかりませんでした。',
}

function chunkText(text: string, chunkSize: number): string[] {
  const graphemes = splitGraphemes(text)
  const chunks: string[] = []
  for (let i = 0; i < graphemes.length; i += chunkSize) {
    chunks.push(graphemes.slice(i, i + chunkSize).join(''))
  }
  return chunks.length > 0 ? chunks : [text]
}

function throwQuestionValidationError(): never {
  const error: AppError = {
    kind: 'validation',
    code: 'VALIDATION_ERROR',
    fields: { question: ['質問は1〜400文字以内で入力してください'] },
  }
  throw error
}

function totalAnswerGraphemes(faqs: readonly Faq[]): number {
  return faqs.reduce((sum, faq) => sum + countGraphemes(faq.answer), 0)
}

export class AnswerService {
  constructor(
    private readonly faqRepository: FaqRepository,
    private readonly historyRepository: HistoryRepository,
    private readonly answerProvider: AnswerProvider,
    private readonly options: Readonly<{ faqBudget: number; chunkSize: number }>,
  ) {}

  async *stream(
    actor: Actor,
    input: QuestionInput,
    signal: AbortSignal,
  ): AsyncIterable<AnswerEvent> {
    if (isBlankInput(input.question) || countGraphemes(input.question) < 1 || countGraphemes(input.question) > 400) {
      throwQuestionValidationError()
    }

    const answerId = randomUUID()
    yield { type: 'start', answerId }

    if (signal.aborted) return

    const faqs = await this.faqRepository.list()

    if (faqs.length === 0) {
      yield* this.commitUnanswerableAndTerminal(actor, answerId, input.question, 'NO_FAQS', signal)
      return
    }

    if (totalAnswerGraphemes(faqs) > this.options.faqBudget) {
      yield* this.commitUnanswerableAndTerminal(actor, answerId, input.question, 'FAQ_BUDGET_EXCEEDED', signal)
      return
    }

    if (signal.aborted) return

    try {
      yield* this.produceAnswer(actor, answerId, input.question, faqs, signal)
    } catch (error) {
      if (signal.aborted) return
      if (error instanceof AnswerProviderError) {
        yield* this.yieldProviderError(answerId, error)
        return
      }
      yield { type: 'error', answerId, code: 'INTERNAL_ERROR', message: '処理に失敗しました', retryable: false }
    }
  }

  private async *produceAnswer(
    actor: Actor,
    answerId: string,
    question: string,
    faqs: readonly Faq[],
    signal: AbortSignal,
  ): AsyncGenerator<AnswerEvent> {
    const providerResult = await this.answerProvider.select(
      {
        question,
        candidates: faqs.map((faq) => ({ id: faq.id, answer: faq.answer })),
      },
      signal,
    )

    if (providerResult.kind === 'unanswerable') {
      yield* this.commitUnanswerableAndTerminal(actor, answerId, question, 'NO_GROUNDING', signal)
      return
    }

    const grounding = GroundingPolicy.build(faqs, providerResult.selections)
    if (grounding.kind === 'invalid') {
      if (signal.aborted) return
      yield { type: 'error', answerId, code: 'GROUNDING_FAILED', message: '根拠の検証に失敗しました', retryable: false }
      return
    }

    const commit = await this.historyRepository.commitComplete({
      accountId: actor.accountId,
      question,
      answer: grounding.answer,
      sources: grounding.sources.map((source, index) => ({
        faqId: source.faqId,
        faqQuestion: source.question,
        exactQuote: source.quote,
        ordinal: index,
      })),
    })
    if (!commit.ok) {
      yield { type: 'error', answerId, code: 'PERSISTENCE_FAILED', message: '回答の保存に失敗しました', retryable: true }
      return
    }

    const chunks = chunkText(grounding.answer, this.options.chunkSize)
    for (let sequence = 0; sequence < chunks.length; sequence++) {
      if (signal.aborted) return
      yield { type: 'chunk', answerId, sequence, text: chunks[sequence] }
    }

    yield { type: 'complete', answerId, answer: grounding.answer, sources: grounding.sources }
  }

  private *yieldProviderError(
    answerId: string,
    error: AnswerProviderError,
  ): Generator<AnswerEvent> {
    if (error.code === 'AI_UNAVAILABLE') {
      yield { type: 'error', answerId, code: 'AI_UNAVAILABLE', message: error.message, retryable: true }
    } else if (error.code === 'AI_TIMEOUT') {
      yield { type: 'error', answerId, code: 'AI_TIMEOUT', message: error.message, retryable: true }
    } else {
      yield { type: 'error', answerId, code: 'GROUNDING_FAILED', message: error.message, retryable: false }
    }
  }

  private async *commitUnanswerableAndTerminal(
    actor: Actor,
    answerId: string,
    question: string,
    reason: 'NO_FAQS' | 'FAQ_BUDGET_EXCEEDED' | 'NO_GROUNDING',
    signal: AbortSignal,
  ): AsyncGenerator<AnswerEvent> {
    const commit = await this.historyRepository.commitUnanswerable({
      accountId: actor.accountId,
      question,
      reason,
    })
    if (!commit.ok) {
      yield { type: 'error', answerId, code: 'PERSISTENCE_FAILED', message: '回答の保存に失敗しました', retryable: true }
      return
    }
    if (signal.aborted) return
    yield { type: 'unanswerable', answerId, reason, message: UNANSWERABLE_MESSAGES[reason] }
  }
}
