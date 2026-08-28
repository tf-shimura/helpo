export type GroundingCandidate = Readonly<{ id: string; question: string; answer: string }>
export type GroundingSelection = Readonly<{ faqId: string; quote: string }>
export type GroundingSource = Readonly<{ faqId: string; question: string; quote: string }>

export type GroundingResult =
  | { kind: 'complete'; answer: string; sources: readonly GroundingSource[] }
  | { kind: 'invalid' }

export class GroundingPolicy {
  static build(
    candidates: readonly GroundingCandidate[],
    selections: readonly GroundingSelection[],
  ): GroundingResult {
    const faqById = new Map(candidates.map((faq) => [faq.id, faq]))
    const seen = new Set<string>()
    const sources: GroundingSource[] = []

    for (const selection of selections) {
      if (seen.has(selection.faqId)) return { kind: 'invalid' }
      seen.add(selection.faqId)

      const faq = faqById.get(selection.faqId)
      if (!faq) return { kind: 'invalid' }
      if (selection.quote.length === 0) return { kind: 'invalid' }
      if (!faq.answer.includes(selection.quote)) return { kind: 'invalid' }

      sources.push({ faqId: faq.id, question: faq.question, quote: selection.quote })
    }

    if (sources.length === 0) return { kind: 'invalid' }

    const answer = sources
      .map((source, index) => {
        const prefix = index > 0 ? '\n\n' : ''
        return `${prefix}FAQ「${source.question}」によると:\n${source.quote}`
      })
      .join('')

    return { kind: 'complete', answer, sources }
  }
}
