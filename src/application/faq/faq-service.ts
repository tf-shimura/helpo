import type { Faq, FaqRepository, Result, Role } from '../ports'
import { countGraphemes } from '../../shared/text/graphemes'

const MIN_GRAPHEMES = 1
const MAX_GRAPHEMES = 1000

export type FaqInput = Readonly<{ question: string; answer: string }>

function isBlank(value: string): boolean {
  return value.trim().length === 0
}

function validateFaqInput(input: FaqInput): Result<void> {
  if (isBlank(input.question) || isBlank(input.answer)) {
    return { ok: false, error: { kind: 'validation', code: 'VALIDATION_ERROR', fields: { question: ['空白のみの入力は許可されていません'], answer: ['空白のみの入力は許可されていません'] } } }
  }
  const q = countGraphemes(input.question)
  const a = countGraphemes(input.answer)
  if (q < MIN_GRAPHEMES || q > MAX_GRAPHEMES || a < MIN_GRAPHEMES || a > MAX_GRAPHEMES) {
    return {
      ok: false,
      error: {
        kind: 'validation',
        code: 'VALIDATION_ERROR',
        fields: {
          question: q < MIN_GRAPHEMES || q > MAX_GRAPHEMES ? [`質問は${MIN_GRAPHEMES}〜${MAX_GRAPHEMES}文字で入力してください`] : [],
          answer: a < MIN_GRAPHEMES || a > MAX_GRAPHEMES ? [`回答は${MIN_GRAPHEMES}〜${MAX_GRAPHEMES}文字で入力してください`] : [],
        },
      },
    }
  }
  return { ok: true, value: undefined }
}

export class FaqService {
  constructor(private readonly faqRepository: FaqRepository) {}

  async list(): Promise<readonly Faq[]> {
    return this.faqRepository.list()
  }

  async create(role: Role, input: FaqInput): Promise<Result<Faq>> {
    if (role !== 'ADMIN') return { ok: false, error: { kind: 'forbidden', code: 'FORBIDDEN' } }
    const validated = validateFaqInput(input)
    if (!validated.ok) return validated as Result<Faq>
    return this.faqRepository.create(input)
  }

  async update(role: Role, faqId: string, input: FaqInput): Promise<Result<Faq>> {
    if (role !== 'ADMIN') return { ok: false, error: { kind: 'forbidden', code: 'FORBIDDEN' } }
    const validated = validateFaqInput(input)
    if (!validated.ok) return validated as Result<Faq>
    return this.faqRepository.update(faqId, input)
  }
}
