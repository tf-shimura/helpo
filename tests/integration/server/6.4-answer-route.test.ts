import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { hash } from 'argon2'
import { resetPrisma } from '../../../src/infrastructure/db/prisma'

const temporaryDirectories: string[] = []
const prismaCli = resolve('node_modules/prisma/build/index.js')
const appOrigin = 'http://localhost:3000'

let fakeResponse = new Response(JSON.stringify({ output_text: JSON.stringify({ unanswerable: true }) }), {
  status: 200,
  headers: { 'content-type': 'application/json' },
})

async function fakeFetch(_url: unknown, _init?: RequestInit): Promise<Response> {
  return fakeResponse
}

async function setupAnswerContext() {
  resetPrisma()
  const directory = await mkdtemp(join(tmpdir(), 'helpo-answer-'))
  temporaryDirectories.push(directory)
  const databaseUrl = `file:${join(directory, 'test.db')}`
  process.env.DATABASE_URL = databaseUrl
  process.env.APP_ORIGIN = appOrigin
  process.env.OPENAI_API_KEY = 'test-key'
  process.env.OPENAI_MODEL = 'gpt-5-nano'
  process.env.OPENAI_TIMEOUT_MS = '10000'
  process.env.OPENAI_MODEL_ACCESS_APPROVED = 'true'
  process.env.OPENAI_DATA_STORAGE_APPROVED = 'true'
  process.env.OPENAI_TRAINING_APPROVED = 'true'
  process.env.OPENAI_REGION_APPROVED = 'true'
  process.env.OPENAI_ORGANIZATION_APPROVED = 'true'
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
  })

  const originalFetch = globalThis.fetch
  globalThis.fetch = fakeFetch as typeof fetch

  const password = 'route-pass'
  const passwordHash = await hash(password, {
    type: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
  })
  const { getPrisma } = await import('../../../src/infrastructure/db/prisma')
  const prisma = getPrisma()
  const employee = await prisma.account.create({
    data: { employeeId: 'E040', passwordHash, role: 'EMPLOYEE' },
  })
  const faq = await prisma.faq.create({ data: { question: 'FQ1', answer: 'exact quote' } })

  const services = await import('../../../src/app/api/v1/services')
  const route = await import('../../../src/app/api/v1/answers/route')

  const login = await services.getAuthService().login({ employeeId: 'E040', password })
  if (!login.ok) throw new Error('login failed')

  return {
    prisma,
    route,
    employeeId: employee.id,
    token: login.value.rawToken,
    faqId: faq.id,
    restoreFetch: () => {
      globalThis.fetch = originalFetch
    },
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function postRequest(body: unknown, token: string | null, extraHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = {
    origin: appOrigin,
    'content-type': 'application/json',
    accept: 'text/event-stream',
    ...extraHeaders,
  }
  if (token) headers.cookie = `helpo_session=${token}`
  return new Request(`${appOrigin}/api/v1/answers`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

async function collectSse(response: Response): Promise<{ event: string; data: unknown }[]> {
  const text = await response.text()
  const frames = text.split('\n\n').filter((frame) => frame.trim().length > 0)
  return frames.map((frame) => {
    const lines = frame.split('\n')
    const eventLine = lines.find((line) => line.startsWith('event: ')) ?? 'event: unknown'
    const dataLine = lines.find((line) => line.startsWith('data: ')) ?? 'data: {}'
    return {
      event: eventLine.replace('event: ', ''),
      data: JSON.parse(dataLine.replace('data: ', '')),
    }
  })
}

describe('Answer route', () => {
  it('POST answerでSSE契約を満たす', async () => {
    const ctx = await setupAnswerContext()

    const noAuth = await ctx.route.POST(postRequest({ question: 'Q' }, null))
    expect(noAuth.status).toBe(401)

    const originBad = await ctx.route.POST(
      postRequest({ question: 'Q' }, ctx.token, { origin: 'http://evil' }),
    )
    expect(originBad.status).toBe(403)

    const noAccept = await ctx.route.POST(
      postRequest({ question: 'Q' }, ctx.token, { accept: 'application/json' }),
    )
    expect(noAccept.status).toBe(406)

    const wrongMedia = await ctx.route.POST(
      postRequest({ question: 'Q' }, ctx.token, { 'content-type': 'text/plain' }),
    )
    expect(wrongMedia.status).toBe(415)

    const tooLong = await ctx.route.POST(postRequest({ question: 'あ'.repeat(401) }, ctx.token))
    expect(tooLong.status).toBe(400)

    fakeResponse = new Response(
      JSON.stringify({
        output_text: JSON.stringify({ selections: [{ faqId: ctx.faqId, quote: 'exact quote' }] }),
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )

    const complete = await ctx.route.POST(postRequest({ question: 'Q' }, ctx.token))
    expect(complete.status).toBe(200)
    expect(complete.headers.get('content-type')).toContain('text/event-stream')
    expect(complete.headers.get('cache-control')).toBe('no-store')

    const completeEvents = await collectSse(complete)
    expect(completeEvents[0].event).toBe('start')
    expect(completeEvents.at(-1)?.event).toBe('complete')
    expect(completeEvents.at(-1)?.data).toMatchObject({ type: 'complete' })

    const history = await ctx.prisma.answerHistory.findFirst({ where: { accountId: ctx.employeeId } })
    expect(history).not.toBeNull()
    expect(history?.outcome).toBe('COMPLETE')

    fakeResponse = new Response(
      JSON.stringify({ output_text: JSON.stringify({ unanswerable: true }) }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )

    const unanswerable = await ctx.route.POST(postRequest({ question: 'Q2' }, ctx.token))
    const unanswerableEvents = await collectSse(unanswerable)
    expect(unanswerableEvents[0].event).toBe('start')
    expect(unanswerableEvents.at(-1)?.event).toBe('unanswerable')

    fakeResponse = new Response(JSON.stringify({ error: 'down' }), { status: 503 })

    const providerError = await ctx.route.POST(postRequest({ question: 'Q3' }, ctx.token))
    const errorEvents = await collectSse(providerError)
    expect(errorEvents[0].event).toBe('start')
    expect(errorEvents.at(-1)?.event).toBe('error')
    expect(errorEvents.at(-1)?.data).toMatchObject({ retryable: true })

    ctx.restoreFetch()
  }, 60_000)
})
