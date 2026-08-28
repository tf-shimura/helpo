import { describe, expect, it } from 'vitest'
import { parseServerConfig } from '../../../src/shared/config/server-config'

const validEnvironment = {
  DATABASE_URL: 'file:./dev.db',
  APP_ORIGIN: 'http://localhost:3000',
  OPENAI_API_KEY: 'secret-api-key',
  OPENAI_MODEL: 'gpt-5-nano',
  OPENAI_TIMEOUT_MS: '30000',
  OPENAI_MODEL_ACCESS_APPROVED: 'true',
  OPENAI_DATA_STORAGE_APPROVED: 'true',
  OPENAI_TRAINING_APPROVED: 'true',
  OPENAI_REGION_APPROVED: 'true',
  OPENAI_ORGANIZATION_APPROVED: 'true',
} as const

const parseValidConfig = (environment: Record<string, string | undefined> = validEnvironment) =>
  parseServerConfig(environment)

describe('server config startup gate', () => {
  it('明示的に許可されたモデルと全承認が揃った場合だけAIをreadyにする', () => {
    const config = parseValidConfig()

    expect(config.ai).toEqual({
      apiKey: 'secret-api-key',
      model: 'gpt-5-nano',
      timeoutMs: 30000,
      isReady: true,
    })
  })

  it.each([
    'OPENAI_MODEL_ACCESS_APPROVED',
    'OPENAI_DATA_STORAGE_APPROVED',
    'OPENAI_TRAINING_APPROVED',
    'OPENAI_REGION_APPROVED',
    'OPENAI_ORGANIZATION_APPROVED',
  ] as const)('%sが未承認ならAI readinessを失敗させる', (key) => {
    expect(() => parseValidConfig({ ...validEnvironment, [key]: 'false' })).toThrow('AI readiness validation failed')
  })

  it.each(['false', '', 'TRUE', ' true ', 'approved'])('承認値%sをfail closedで拒否する', (approval) => {
    expect(() => parseValidConfig({ ...validEnvironment, OPENAI_MODEL_ACCESS_APPROVED: approval })).toThrow(
      'AI readiness validation failed',
    )
  })

  it('allowlist外のモデルへfallbackしない', () => {
    expect(() => parseValidConfig({ ...validEnvironment, OPENAI_MODEL: 'unapproved-model' })).toThrow(
      'AI readiness validation failed',
    )
  })

  it.each([
    'DATABASE_URL',
    'APP_ORIGIN',
    'OPENAI_API_KEY',
    'OPENAI_MODEL',
    'OPENAI_TIMEOUT_MS',
    'OPENAI_MODEL_ACCESS_APPROVED',
    'OPENAI_DATA_STORAGE_APPROVED',
    'OPENAI_TRAINING_APPROVED',
    'OPENAI_REGION_APPROVED',
    'OPENAI_ORGANIZATION_APPROVED',
  ] as const)(
    '%sが欠落している場合は値を表示せず失敗する',
    (key) => {
      const environment = { ...validEnvironment }
      delete (environment as Partial<typeof validEnvironment>)[key]

      expect(() => parseValidConfig(environment)).toThrow('Server configuration validation failed')
    },
  )

  it.each(['0', '100', '300001', 'invalid'])('不正なtimeout %sを値非表示で拒否する', (timeout) => {
    expect(() => parseValidConfig({ ...validEnvironment, OPENAI_TIMEOUT_MS: timeout })).toThrow(
      'Server configuration validation failed',
    )
  })

  it('検証エラーへ秘密値を含めない', () => {
    const secret = 'do-not-leak-this-secret'

    expect(() => parseValidConfig({ ...validEnvironment, OPENAI_API_KEY: secret, APP_ORIGIN: 'invalid' })).toThrowError(
      expect.not.objectContaining({ message: expect.stringContaining(secret) }),
    )
  })
})
