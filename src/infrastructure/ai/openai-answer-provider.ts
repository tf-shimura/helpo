import 'server-only'
import { z } from 'zod'
import type { AnswerProvider, ProviderResult } from '../../application/answer/types'
import { AnswerProviderError } from '../../application/answer/types'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'

const selectionsSchema = z.object({
  selections: z.array(
    z.object({
      faqId: z.string(),
      quote: z.string(),
    }),
  ),
})

const unanswerableSchema = z.object({
  unanswerable: z.literal(true),
})

const providerResultSchema = z.union([selectionsSchema, unanswerableSchema])

function extractOutputText(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const record = data as Record<string, unknown>
  if (typeof record.output_text === 'string') return record.output_text

  const outputs = Array.isArray(record.output) ? record.output : []
  const first = outputs[0]
  if (typeof first !== 'object' || first === null) return undefined
  const firstRecord = first as Record<string, unknown>
  const content = Array.isArray(firstRecord.content) ? firstRecord.content : []
  const textItem = content.find(
    (item) => typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).text === 'string',
  )
  return typeof textItem === 'object' && textItem !== null
    ? (textItem as Record<string, unknown>).text as string
    : undefined
}

export class OpenAiAnswerProvider implements AnswerProvider {
  constructor(
    private readonly config: Readonly<{
      apiKey: string
      model: string
      timeoutMs: number
    }>,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  async select(
    input: Readonly<{
      question: string
      candidates: readonly Readonly<{ id: string; answer: string }>[]
    }>,
    signal: AbortSignal,
  ): Promise<ProviderResult> {
    const controller = new AbortController()

    if (signal.aborted) {
      controller.abort()
      throw signal.reason ?? new DOMException('Aborted', 'AbortError')
    }

    const onUserAbort = () => controller.abort()
    signal.addEventListener('abort', onUserAbort, { once: true })

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort()
        reject(new AnswerProviderError('AI_TIMEOUT', true, 'provider call timed out'))
      }, this.config.timeoutMs)
    })

    let fetchPromise: Promise<Response>
    try {
      fetchPromise = this.fetchFn(OPENAI_RESPONSES_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.buildRequest(input)),
        signal: controller.signal,
      })
    } catch (error) {
      clearTimeout(timeoutId)
      signal.removeEventListener('abort', onUserAbort)
      throw this.classifyError(error)
    }

    try {
      const response = await Promise.race([fetchPromise, timeoutPromise])
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        console.error('[OpenAiAnswerProvider] non-ok response', { status: response.status, body, keyLength: this.config.apiKey.length, model: this.config.model })
        throw new AnswerProviderError('AI_UNAVAILABLE', true, `provider responded ${response.status}`)
      }
      const data = (await response.json()) as unknown
      const outputText = extractOutputText(data)
      if (outputText === undefined) {
        throw new AnswerProviderError('GROUNDING_FAILED', false, 'provider output text not found')
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(outputText)
      } catch {
        throw new AnswerProviderError('GROUNDING_FAILED', false, 'provider output was not valid JSON')
      }

      const validated = providerResultSchema.safeParse(parsed)
      if (!validated.success) {
        throw new AnswerProviderError('GROUNDING_FAILED', false, 'provider output schema mismatch')
      }

      if ('unanswerable' in validated.data) {
        return { kind: 'unanswerable', reason: 'NO_GROUNDING' }
      }

      return {
        kind: 'selected',
        selections: validated.data.selections.map((selection) => ({
          faqId: selection.faqId,
          quote: selection.quote,
        })),
      }
    } catch (error) {
      if (error instanceof AnswerProviderError) throw error
      if (signal.aborted) throw error
      throw this.classifyError(error)
    } finally {
      clearTimeout(timeoutId)
      signal.removeEventListener('abort', onUserAbort)
    }
  }

  private buildRequest(
    input: Readonly<{
      question: string
      candidates: readonly Readonly<{ id: string; answer: string }>[]
    }>,
  ): Record<string, unknown> {
    const candidatesText = input.candidates
      .map((candidate) => `id: ${candidate.id}\nanswer: ${candidate.answer}`)
      .join('\n---\n')

    return {
      model: this.config.model,
      instructions:
        'You select relevant FAQ entries for the user question. Return a JSON object matching one of these two shapes exactly: { "selections": [{ "faqId": "<id>", "quote": "<exact substring of FAQ answer>" }] } or { "unanswerable": true }. Do not include any other text.',
      input: `Question: ${input.question}\n\nCandidates:\n${candidatesText}`,
      text: {
        format: {
          type: 'json_schema',
          name: 'faq_selections',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            oneOf: [
              {
                type: 'object',
                additionalProperties: false,
                properties: {
                  selections: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        faqId: { type: 'string' },
                        quote: { type: 'string' },
                      },
                      required: ['faqId', 'quote'],
                    },
                  },
                },
                required: ['selections'],
              },
              {
                type: 'object',
                additionalProperties: false,
                properties: {
                  unanswerable: { type: 'boolean', enum: [true] },
                },
                required: ['unanswerable'],
              },
            ],
          },
        },
      },
      store: false,
    }
  }

  private classifyError(error: unknown): AnswerProviderError {
    if (error instanceof AnswerProviderError) return error
    if (error instanceof SyntaxError) {
      return new AnswerProviderError('GROUNDING_FAILED', false, 'provider output was not valid JSON')
    }
    return new AnswerProviderError('AI_UNAVAILABLE', true, 'provider request failed')
  }
}
