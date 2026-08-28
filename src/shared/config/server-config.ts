import 'server-only'
import { z } from 'zod'

const serverEnvironmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_ORIGIN: z.url().refine((value) => value.startsWith('http://') || value.startsWith('https://')),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000),
  OPENAI_MODEL_ACCESS_APPROVED: z.string(),
  OPENAI_DATA_STORAGE_APPROVED: z.string(),
  OPENAI_TRAINING_APPROVED: z.string(),
  OPENAI_REGION_APPROVED: z.string(),
  OPENAI_ORGANIZATION_APPROVED: z.string(),
})

const APPROVED_OPENAI_MODELS = [
  {
    id: 'gpt-5-nano',
    api: 'responses',
    structuredOutputs: true,
    store: false,
  },
  {
    id: 'o3-mini',
    api: 'responses',
    structuredOutputs: true,
    store: false,
  },
] as const

export type ServerConfig = Readonly<{
  databaseUrl: string
  appOrigin: string
  ai: Readonly<{
    apiKey: string
    model: string
    timeoutMs: number
    isReady: true
  }>
}>

export function parseServerConfig(environment: Record<string, string | undefined>): ServerConfig {
  const parsed = serverEnvironmentSchema.safeParse(environment)
  if (!parsed.success) throw new Error('Server configuration validation failed')
  const isGovernanceApproved = [
    parsed.data.OPENAI_MODEL_ACCESS_APPROVED,
    parsed.data.OPENAI_DATA_STORAGE_APPROVED,
    parsed.data.OPENAI_TRAINING_APPROVED,
    parsed.data.OPENAI_REGION_APPROVED,
    parsed.data.OPENAI_ORGANIZATION_APPROVED,
  ].every((approval) => approval === 'true')
  const approvedModel = APPROVED_OPENAI_MODELS.find((model) => model.id === parsed.data.OPENAI_MODEL)
  if (
    !isGovernanceApproved ||
    approvedModel?.api !== 'responses' ||
    approvedModel.structuredOutputs !== true ||
    approvedModel.store !== false
  ) {
    throw new Error('AI readiness validation failed')
  }

  return {
    databaseUrl: parsed.data.DATABASE_URL,
    appOrigin: parsed.data.APP_ORIGIN,
    ai: {
      apiKey: parsed.data.OPENAI_API_KEY,
      model: parsed.data.OPENAI_MODEL,
      timeoutMs: parsed.data.OPENAI_TIMEOUT_MS,
      isReady: true,
    },
  }
}
