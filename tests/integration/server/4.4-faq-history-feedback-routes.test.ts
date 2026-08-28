import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { hash } from 'argon2'
import { getPrisma, resetPrisma } from '../../../src/infrastructure/db/prisma'

const temporaryDirectories: string[] = []
const prismaCli = resolve('node_modules/prisma/build/index.js')
const appOrigin = 'http://localhost:3000'

async function setupContext() {
  resetPrisma()
  const directory = await mkdtemp(join(tmpdir(), 'helpo-routes-'))
  temporaryDirectories.push(directory)
  const databaseUrl = `file:${join(directory, 'test.db')}`
  process.env.DATABASE_URL = databaseUrl
  process.env.APP_ORIGIN = appOrigin
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
  })

  const password = 'route-pass'
  const passwordHash = await hash(password, {
    type: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
  })
  const prisma = getPrisma()
  const employee = await prisma.account.create({
    data: { employeeId: 'E030', passwordHash, role: 'EMPLOYEE' },
  })
  const admin = await prisma.account.create({
    data: { employeeId: 'A030', passwordHash, role: 'ADMIN' },
  })

  const services = await import('../../../src/app/api/v1/services')
  const faqsRoute = await import('../../../src/app/api/v1/faqs/route')
  const faqPatchRoute = await import('../../../src/app/api/v1/faqs/[faqId]/route')
  const historyRoute = await import('../../../src/app/api/v1/history/route')
  const feedbackRoute = await import('../../../src/app/api/v1/answers/[answerId]/feedback/route')

  const employeeLogin = await services.getAuthService().login({ employeeId: 'E030', password })
  const adminLogin = await services.getAuthService().login({ employeeId: 'A030', password })
  if (!employeeLogin.ok || !adminLogin.ok) throw new Error('login failed')

  return {
    prisma,
    faqsRoute,
    faqPatchRoute,
    historyRoute,
    feedbackRoute,
    employeeId: employee.id,
    employeeToken: employeeLogin.value.rawToken,
    adminToken: adminLogin.value.rawToken,
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function request(method: string, path: string, body: unknown, token: string, extraHeaders: Record<string, string> = {}) {
  return new Request(`${appOrigin}${path}`, {
    method,
    headers: {
      origin: appOrigin,
      'content-type': 'application/json',
      cookie: `helpo_session=${token}`,
      ...extraHeaders,
    },
    body: body === null ? null : JSON.stringify(body),
  })
}

function getRequest(path: string, token: string) {
  return new Request(`${appOrigin}${path}`, {
    headers: { cookie: `helpo_session=${token}` },
  })
}

describe('FAQ / history / feedback routes', () => {
  it('全routeで認証・権限・Origin・契約を満たす', async () => {
    const ctx = await setupContext()

    const list = await ctx.faqsRoute.GET(getRequest('/api/v1/faqs', ctx.employeeToken))
    expect(list.status).toBe(200)
    const listBody = await list.json()
    expect(listBody.data.items).toEqual([])

    const forbiddenCreate = await ctx.faqsRoute.POST(request('POST', '/api/v1/faqs', { question: 'Q', answer: 'A' }, ctx.employeeToken))
    expect(forbiddenCreate.status).toBe(403)

    const originBad = await ctx.faqsRoute.POST(request('POST', '/api/v1/faqs', { question: 'Q', answer: 'A' }, ctx.adminToken, { origin: 'http://evil' }))
    expect(originBad.status).toBe(403)

    const create = await ctx.faqsRoute.POST(request('POST', '/api/v1/faqs', { question: 'Q1', answer: 'A1' }, ctx.adminToken))
    expect(create.status).toBe(201)
    const createBody = await create.json()
    expect(createBody.data.question).toBe('Q1')
    const faqId = createBody.data.id

    const long = await ctx.faqsRoute.POST(request('POST', '/api/v1/faqs', { question: 'Q', answer: 'a'.repeat(1001) }, ctx.adminToken))
    expect(long.status).toBe(400)

    const patch = await ctx.faqPatchRoute.PATCH(request('PATCH', `/api/v1/faqs/${faqId}`, { question: 'Q2', answer: 'A2' }, ctx.adminToken))
    expect(patch.status).toBe(200)
    const patchBody = await patch.json()
    expect(patchBody.data.question).toBe('Q2')

    const sourceFaq = await ctx.prisma.faq.create({ data: { question: 'FQ', answer: 'quote' } })
    const completeHistory = await ctx.prisma.answerHistory.create({
      data: {
        accountId: ctx.employeeId,
        question: 'Q1',
        outcome: 'COMPLETE',
        answer: 'A1',
        sources: { create: [{ faqId: sourceFaq.id, faqQuestion: sourceFaq.question, exactQuote: sourceFaq.answer, ordinal: 0 }] },
      },
    })
    const unanswerableHistory = await ctx.prisma.answerHistory.create({
      data: {
        accountId: ctx.employeeId,
        question: 'Q2',
        outcome: 'UNANSWERABLE',
        reason: 'NO_FAQS',
      },
    })

    const history = await ctx.historyRoute.GET(getRequest('/api/v1/history', ctx.employeeToken))
    expect(history.status).toBe(200)
    const historyBody = await history.json()
    expect(historyBody.data.items.length).toBe(2)

    const feedback = await ctx.feedbackRoute.POST(request('POST', `/api/v1/answers/${completeHistory.id}/feedback`, { value: 'GOOD' }, ctx.employeeToken))
    expect(feedback.status).toBe(201)
    const feedbackBody = await feedback.json()
    expect(feedbackBody.data.value).toBe('GOOD')

    const unanswerableFeedback = await ctx.feedbackRoute.POST(request('POST', `/api/v1/answers/${unanswerableHistory.id}/feedback`, { value: 'GOOD' }, ctx.employeeToken))
    expect(unanswerableFeedback.status).toBe(404)

    const dup = await ctx.feedbackRoute.POST(request('POST', `/api/v1/answers/${completeHistory.id}/feedback`, { value: 'BAD' }, ctx.employeeToken))
    expect(dup.status).toBe(409)
  })
})
