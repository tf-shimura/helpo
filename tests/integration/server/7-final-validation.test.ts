import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
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

async function setupContext() {
  resetPrisma()
  const directory = await mkdtemp(join(tmpdir(), 'helpo-final-'))
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
    data: { employeeId: 'E070', passwordHash, role: 'EMPLOYEE' },
  })
  const other = await prisma.account.create({
    data: { employeeId: 'E071', passwordHash, role: 'EMPLOYEE' },
  })
  const admin = await prisma.account.create({
    data: { employeeId: 'A070', passwordHash, role: 'ADMIN' },
  })
  const faq = await prisma.faq.create({ data: { question: 'FQ', answer: 'exact quote' } })

  const services = await import('../../../src/app/api/v1/services')
  const sessionRoute = await import('../../../src/app/api/v1/session/route')
  const faqsRoute = await import('../../../src/app/api/v1/faqs/route')
  const faqPatchRoute = await import('../../../src/app/api/v1/faqs/[faqId]/route')
  const historyRoute = await import('../../../src/app/api/v1/history/route')
  const answerRoute = await import('../../../src/app/api/v1/answers/route')
  const feedbackRoute = await import('../../../src/app/api/v1/answers/[answerId]/feedback/route')

  const employeeLogin = await services.getAuthService().login({ employeeId: 'E070', password })
  const otherLogin = await services.getAuthService().login({ employeeId: 'E071', password })
  const adminLogin = await services.getAuthService().login({ employeeId: 'A070', password })
  if (!employeeLogin.ok || !otherLogin.ok || !adminLogin.ok) throw new Error('login failed')

  return {
    prisma,
    sessionRoute,
    faqsRoute,
    faqPatchRoute,
    historyRoute,
    answerRoute,
    feedbackRoute,
    employeeId: employee.id,
    otherId: other.id,
    adminId: admin.id,
    employeeToken: employeeLogin.value.rawToken,
    otherToken: otherLogin.value.rawToken,
    adminToken: adminLogin.value.rawToken,
    faqId: faq.id,
    setProviderResponse: (response: Response) => {
      fakeResponse = response
    },
    restoreFetch: () => {
      globalThis.fetch = originalFetch
    },
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function request(method: string, path: string, body: unknown, token: string | null, extraHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = {
    origin: appOrigin,
    'content-type': 'application/json',
    ...extraHeaders,
  }
  if (token) headers.cookie = `helpo_session=${token}`
  return new Request(`${appOrigin}${path}`, {
    method,
    headers,
    body: body === null ? null : JSON.stringify(body),
  })
}

function getRequest(path: string, token: string) {
  return new Request(`${appOrigin}${path}`, {
    headers: { cookie: `helpo_session=${token}` },
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

function assertEnvelope(error: unknown, code: string) {
  expect(error).toMatchObject({ error: { code, requestId: expect.any(String), message: expect.any(String) } })
}

describe('7.x final validation', () => {
  it('7.1 OpenAPIの全operationとレスポンスcodeを満たす', async () => {
    const ctx = await setupContext()

    const openapi = (await readFile(resolve('.kiro/specs/helpo-server/openapi.yaml'))).toString()
    expect(openapi).toContain('openapi: 3.1.0')
    for (const path of ['/session', '/faqs', '/faqs/{faqId}', '/answers', '/history', '/answers/{answerId}/feedback']) {
      expect(openapi).toContain(path)
    }

    const getSession = await ctx.sessionRoute.GET(getRequest('/api/v1/session', ctx.employeeToken))
    expect(getSession.status).toBe(200)
    const actor = await getSession.json()
    expect(actor.data.role).toBe('EMPLOYEE')
    expect(actor.data).not.toHaveProperty('passwordHash')

    const badOrigin = await ctx.sessionRoute.POST(
      new Request(`${appOrigin}/api/v1/session`, {
        method: 'POST',
        headers: { origin: 'http://evil', 'content-type': 'application/json' },
        body: JSON.stringify({ employeeId: 'E070', password: 'wrong' }),
      }),
    )
    expect(badOrigin.status).toBe(403)
    assertEnvelope(await badOrigin.json(), 'ORIGIN_FORBIDDEN')

    const badLogin = await ctx.sessionRoute.POST(request('POST', '/api/v1/session', { employeeId: 'E070', password: 'x' }, null))
    expect(badLogin.status).toBe(401)
    assertEnvelope(await badLogin.json(), 'INVALID_CREDENTIALS')

    const list = await ctx.faqsRoute.GET(getRequest('/api/v1/faqs', ctx.employeeToken))
    expect(list.status).toBe(200)
    expect(await list.json()).toMatchObject({ data: { items: expect.any(Array) } })

    const createForbidden = await ctx.faqsRoute.POST(request('POST', '/api/v1/faqs', { question: 'Q', answer: 'A' }, ctx.employeeToken))
    expect(createForbidden.status).toBe(403)
    assertEnvelope(await createForbidden.json(), 'FORBIDDEN')

    const create = await ctx.faqsRoute.POST(request('POST', '/api/v1/faqs', { question: 'Q1', answer: 'A1' }, ctx.adminToken))
    expect(create.status).toBe(201)
    const created = await create.json()
    expect(created.data.question).toBe('Q1')

    const conflict = await ctx.faqsRoute.POST(request('POST', '/api/v1/faqs', { question: 'Q1', answer: 'A2' }, ctx.adminToken))
    expect(conflict.status).toBe(409)
    assertEnvelope(await conflict.json(), 'FAQ_QUESTION_CONFLICT')

    const missingFaq = '00000000-0000-0000-0000-000000000000'
    const notFound = await ctx.faqPatchRoute.PATCH(request('PATCH', `/api/v1/faqs/${missingFaq}`, { question: 'X', answer: 'Y' }, ctx.adminToken))
    expect(notFound.status).toBe(404)
    assertEnvelope(await notFound.json(), 'NOT_FOUND')

    fakeResponse = new Response(
      JSON.stringify({
        output_text: JSON.stringify({ selections: [{ faqId: ctx.faqId, quote: 'exact quote' }] }),
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )

    const answer = await ctx.answerRoute.POST(
      new Request(`${appOrigin}/api/v1/answers`, {
        method: 'POST',
        headers: { origin: appOrigin, 'content-type': 'application/json', cookie: `helpo_session=${ctx.employeeToken}`, accept: 'text/event-stream' },
        body: JSON.stringify({ question: 'Q' }),
      }),
    )
    expect(answer.status).toBe(200)
    expect(answer.headers.get('cache-control')).toBe('no-store')
    const events = await collectSse(answer)
    expect(events[0].event).toBe('start')
    expect(events.at(-1)?.event).toBe('complete')

    const badAccept = await ctx.answerRoute.POST(
      new Request(`${appOrigin}/api/v1/answers`, {
        method: 'POST',
        headers: { origin: appOrigin, 'content-type': 'application/json', cookie: `helpo_session=${ctx.employeeToken}`, accept: 'application/json' },
        body: JSON.stringify({ question: 'Q' }),
      }),
    )
    expect(badAccept.status).toBe(406)
    assertEnvelope(await badAccept.json(), 'NOT_ACCEPTABLE')

    const sourceFaq = await ctx.prisma.faq.create({ data: { question: 'SF', answer: 'quote' } })
    const completeHistory = await ctx.prisma.answerHistory.create({
      data: {
        accountId: ctx.employeeId,
        question: 'Q1',
        outcome: 'COMPLETE',
        answer: 'A1',
        sources: { create: [{ faqId: sourceFaq.id, faqQuestion: sourceFaq.question, exactQuote: sourceFaq.answer, ordinal: 0 }] },
      },
    })
    const feedback = await ctx.feedbackRoute.POST(request('POST', `/api/v1/answers/${completeHistory.id}/feedback`, { value: 'GOOD' }, ctx.employeeToken))
    expect(feedback.status).toBe(201)
    expect(await feedback.json()).toMatchObject({ data: { value: 'GOOD' } })

    const dupFeedback = await ctx.feedbackRoute.POST(request('POST', `/api/v1/answers/${completeHistory.id}/feedback`, { value: 'BAD' }, ctx.employeeToken))
    expect(dupFeedback.status).toBe(409)
    assertEnvelope(await dupFeedback.json(), 'FEEDBACK_CONFLICT')

    ctx.restoreFetch()
  }, 120_000)

  it('7.2 秘密・provider body・本文がレスポンスに漏れない', async () => {
    const ctx = await setupContext()

    const secretCheck = async (response: Response) => {
      const text = await response.text()
      expect(text).not.toContain('route-pass')
      expect(text).not.toContain(ctx.employeeToken)
      expect(text).not.toMatch(/helpo_session=[^;]*[a-f0-9]{32,}/i)
      expect(text).not.toContain('test-key')
      expect(text).not.toContain('exact quote')
    }

    const login = await ctx.sessionRoute.POST(request('POST', '/api/v1/session', { employeeId: 'E070', password: 'route-pass' }, null))
    await secretCheck(login)

    const badAnswer = await ctx.answerRoute.POST(
      new Request(`${appOrigin}/api/v1/answers`, {
        method: 'POST',
        headers: { origin: appOrigin, 'content-type': 'text/plain', cookie: `helpo_session=${ctx.employeeToken}`, accept: 'text/event-stream' },
        body: JSON.stringify({ question: 'Q' }),
      }),
    )
    await secretCheck(badAnswer)

    const getSession = await ctx.sessionRoute.GET(getRequest('/api/v1/session', ctx.employeeToken))
    await secretCheck(getSession)

    const cookie = login.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')

    ctx.restoreFetch()
  }, 120_000)

  it('7.3 保存・owner分離・race・FAQ上限を満たす', async () => {
    const ctx = await setupContext()

    fakeResponse = new Response(
      JSON.stringify({
        output_text: JSON.stringify({ selections: [{ faqId: ctx.faqId, quote: 'exact quote' }] }),
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )

    const answer = await ctx.answerRoute.POST(
      new Request(`${appOrigin}/api/v1/answers`, {
        method: 'POST',
        headers: { origin: appOrigin, 'content-type': 'application/json', cookie: `helpo_session=${ctx.employeeToken}`, accept: 'text/event-stream' },
        body: JSON.stringify({ question: 'save-test' }),
      }),
    )
    await collectSse(answer)

    const history = await ctx.historyRoute.GET(getRequest('/api/v1/history', ctx.employeeToken))
    const historyJson = await history.json()
    expect(historyJson.data.items.length).toBeGreaterThan(0)
    expect(historyJson.data.items[0].question).toBe('save-test')

    const otherHistory = await ctx.historyRoute.GET(getRequest('/api/v1/history', ctx.otherToken))
    const otherJson = await otherHistory.json()
    expect(otherJson.data.items).toHaveLength(0)

    const sourceFaq = await ctx.prisma.faq.create({ data: { question: 'SF', answer: 'quote' } })
    const completeHistory = await ctx.prisma.answerHistory.create({
      data: {
        accountId: ctx.employeeId,
        question: 'Q1',
        outcome: 'COMPLETE',
        answer: 'A1',
        sources: { create: [{ faqId: sourceFaq.id, faqQuestion: sourceFaq.question, exactQuote: sourceFaq.answer, ordinal: 0 }] },
      },
    })

    const [first, second] = await Promise.all([
      ctx.feedbackRoute.POST(request('POST', `/api/v1/answers/${completeHistory.id}/feedback`, { value: 'GOOD' }, ctx.employeeToken)),
      ctx.feedbackRoute.POST(request('POST', `/api/v1/answers/${completeHistory.id}/feedback`, { value: 'GOOD' }, ctx.employeeToken)),
    ])
    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([201, 409])

    await ctx.prisma.faq.create({ data: { question: 'BIG', answer: 'あ'.repeat(5000) } })
    fakeResponse = new Response(JSON.stringify({ output_text: JSON.stringify({ unanswerable: true }) }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

    const budget = await ctx.answerRoute.POST(
      new Request(`${appOrigin}/api/v1/answers`, {
        method: 'POST',
        headers: { origin: appOrigin, 'content-type': 'application/json', cookie: `helpo_session=${ctx.employeeToken}`, accept: 'text/event-stream' },
        body: JSON.stringify({ question: 'big' }),
      }),
    )
    const budgetEvents = await collectSse(budget)
    expect(budgetEvents.at(-1)?.event).toBe('unanswerable')
    expect((budgetEvents.at(-1)?.data as { reason?: string }).reason).toBe('FAQ_BUDGET_EXCEEDED')

    ctx.restoreFetch()
  }, 120_000)
})
