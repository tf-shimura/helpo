import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { hash } from 'argon2'
import { resetPrisma } from '../../../src/infrastructure/db/prisma'
import { createApiClient, type HelpoApiClient } from '../../../src/presentation/api/api-client'

const prismaCli = resolve('node_modules/prisma/build/index.js')
const appOrigin = 'http://localhost:3000'
const apiBase = '/api/v1'
const openAiUrl = 'https://api.openai.com/v1/responses'

export type RouteModule =
  | { GET?: (request: Request) => Promise<Response> | Response; POST?: (request: Request) => Promise<Response> | Response; DELETE?: (request: Request) => Promise<Response> | Response }
  | { GET?: (request: Request) => Promise<Response> | Response; POST?: (request: Request) => Promise<Response> | Response; PATCH?: (request: Request) => Promise<Response> | Response }

type Routes = {
  session: RouteModule
  faqs: RouteModule
  faqDetail: RouteModule
  history: RouteModule
  answers: RouteModule
  feedback: RouteModule
}

export type SeededData = Readonly<{
  employee: { employeeId: string; password: string }
  admin: { employeeId: string; password: string }
  faq: { id: string; question: string; answer: string }
}>

export type Harness = Readonly<{
  client: HelpoApiClient
  prisma: Awaited<ReturnType<typeof importPrisma>>
  seeded: SeededData
  setOpenAiResponse: (response: Response) => void
  setOpenAiJson: (body: unknown, status?: number) => void
  dispose: () => Promise<void>
}>

type MutableCookieJar = {
  token: string | null
  apply: (headers: Headers) => void
  store: (response: Response) => void
}

function createCookieJar(): MutableCookieJar {
  return {
    token: null,
    apply(headers: Headers) {
      if (this.token) {
        headers.set('cookie', `helpo_session=${this.token}`)
      }
    },
    store(response: Response) {
      const setCookie = response.headers.get('set-cookie')
      if (!setCookie) return
      const match = setCookie.match(/helpo_session=([^;]+)/)
      if (!match) return
      if (setCookie.includes('Max-Age=0')) {
        this.token = null
      } else {
        this.token = match[1]
      }
    },
  }
}

async function importPrisma() {
  const { getPrisma } = await import('../../../src/infrastructure/db/prisma')
  return getPrisma()
}

async function importRoutes(): Promise<Routes> {
  const [session, faqs, faqDetail, history, answers, feedback] = await Promise.all([
    import('../../../src/app/api/v1/session/route'),
    import('../../../src/app/api/v1/faqs/route'),
    import('../../../src/app/api/v1/faqs/[faqId]/route'),
    import('../../../src/app/api/v1/history/route'),
    import('../../../src/app/api/v1/answers/route'),
    import('../../../src/app/api/v1/answers/[answerId]/feedback/route'),
  ])
  return { session, faqs, faqDetail, history, answers, feedback } as Routes
}

function buildHeaders(init: RequestInit | undefined, jar: MutableCookieJar): Headers {
  const headers = new Headers(init?.headers)
  if (!headers.has('origin')) {
    headers.set('origin', appOrigin)
  }
  jar.apply(headers)
  return headers
}

async function callRoute(route: RouteModule, method: string, request: Request): Promise<Response> {
  const handler = (route as Record<string, (request: Request) => Promise<Response> | Response>)[method]
  if (!handler) throw new Error(`Method ${method} not supported for route`)
  return handler(request)
}

async function routeRequest(routes: Routes, method: string, url: URL, init: RequestInit | undefined, jar: MutableCookieJar): Promise<Response> {
  const headers = buildHeaders(init, jar)
  const request = new Request(url.toString(), { method, headers, body: init?.body, signal: init?.signal })

  const pathParts = url.pathname.slice(apiBase.length).split('/').filter(Boolean)
  let response: Response

  if (pathParts[0] === 'session') {
    response = await callRoute(routes.session, method, request)
  } else if (pathParts[0] === 'faqs' && pathParts.length === 1) {
    response = await callRoute(routes.faqs, method, request)
  } else if (pathParts[0] === 'faqs' && pathParts.length === 2) {
    response = await callRoute(routes.faqDetail, method, new Request(`${appOrigin}/api/v1/faqs/${pathParts[1]}`, request))
  } else if (pathParts[0] === 'history') {
    response = await callRoute(routes.history, method, request)
  } else if (pathParts[0] === 'answers' && pathParts.length === 1) {
    response = await callRoute(routes.answers, method, request)
  } else if (pathParts[0] === 'answers' && pathParts.length === 3 && pathParts[2] === 'feedback') {
    response = await callRoute(routes.feedback, method, new Request(`${appOrigin}/api/v1/answers/${pathParts[1]}/feedback`, request))
  } else {
    throw new Error(`Unknown route: ${url.pathname}`)
  }

  jar.store(response)
  return response
}

let currentOpenAiResponse: Response | Promise<Response> = new Response(JSON.stringify({ output_text: JSON.stringify({ unanswerable: true }) }), {
  status: 200,
  headers: { 'content-type': 'application/json' },
})

export function setOpenAiResponse(response: Response | Promise<Response>): void {
  currentOpenAiResponse = response
}

export function setOpenAiJson(body: unknown, status = 200): void {
  setOpenAiResponse(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

export async function setupClientIntegration(): Promise<Harness> {
  resetPrisma()
  const directory = await mkdtemp(join(tmpdir(), 'helpo-client-integration-'))
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

  const prisma = await importPrisma()
  const password = 'route-pass'
  const passwordHash = await hash(password, {
    type: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
  })

  const employee = await prisma.account.create({
    data: { employeeId: 'E020', passwordHash, role: 'EMPLOYEE' },
  })
  const admin = await prisma.account.create({
    data: { employeeId: 'A020', passwordHash, role: 'ADMIN' },
  })
  const faq = await prisma.faq.create({ data: { question: 'FQ1', answer: 'exact quote for grounding' } })

  const routes = await importRoutes()

  const jar = createCookieJar()

  const originalFetch = globalThis.fetch
  const browserFetch: typeof fetch = async (input, init) => {
    if (init?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    const urlString =
      typeof input === 'string' ? input : input instanceof Request ? input.url : input.href
    if (urlString === openAiUrl) {
      return await currentOpenAiResponse
    }
    const url = new URL(urlString, appOrigin)
    if (url.origin !== appOrigin || !url.pathname.startsWith(apiBase)) {
      throw new Error(`Unexpected fetch target: ${urlString}`)
    }
    return routeRequest(routes, init?.method ?? 'GET', url, init, jar)
  }
  globalThis.fetch = browserFetch

  const client = createApiClient()

  return {
    client,
    prisma,
    seeded: {
      employee: { employeeId: 'E020', password },
      admin: { employeeId: 'A020', password },
      faq: { id: faq.id, question: faq.question, answer: faq.answer },
    },
    setOpenAiResponse,
    setOpenAiJson,
    dispose: async () => {
      globalThis.fetch = originalFetch
      await prisma.$disconnect()
      await rm(directory, { recursive: true, force: true })
      resetPrisma()
    },
  }
}
