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

async function setupRoute() {
  resetPrisma()
  const directory = await mkdtemp(join(tmpdir(), 'helpo-route-'))
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
  const { getPrisma } = await import('../../../src/infrastructure/db/prisma')
  const prisma = getPrisma()
  const route = await import('../../../src/app/api/v1/session/route')
  await prisma.account.create({
    data: { employeeId: 'E020', passwordHash, role: 'EMPLOYEE' },
  })
  return { route, password, employeeId: 'E020' }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function postRequest(body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Request(`${appOrigin}/api/v1/session`, {
    method: 'POST',
    headers: {
      origin: appOrigin,
      'content-type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  })
}

describe('Session route', () => {
  it('POST login失敗で401、成功でSet-CookieとActorを返す', async () => {
    const { route, password, employeeId } = await setupRoute()

    const invalid = await route.POST(postRequest({ employeeId, password: 'wrong' }))
    expect(invalid.status).toBe(401)
    const invalidBody = await invalid.json()
    expect(invalidBody.error.code).toBe('INVALID_CREDENTIALS')

    const login = await route.POST(postRequest({ employeeId, password }))
    expect(login.status).toBe(200)
    const cookie = login.headers.get('set-cookie')
    expect(cookie).toContain('helpo_session=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    const loginBody = await login.json()
    expect(loginBody.data.employeeId).toBe(employeeId)
    expect(loginBody.data.role).toBe('EMPLOYEE')

    const tokenMatch = cookie?.match(/helpo_session=([^;]+)/)
    const token = tokenMatch?.[1]
    expect(token).toBeDefined()

    const get = await route.GET(
      new Request(`${appOrigin}/api/v1/session`, {
        headers: { cookie: `helpo_session=${token}` },
      }),
    )
    expect(get.status).toBe(200)
    const getBody = await get.json()
    expect(getBody.data.employeeId).toBe(employeeId)

    const logout = await route.DELETE(
      new Request(`${appOrigin}/api/v1/session`, {
        method: 'DELETE',
        headers: { origin: appOrigin, cookie: `helpo_session=${token}` },
      }),
    )
    expect(logout.status).toBe(204)
    const clearCookie = logout.headers.get('set-cookie')
    expect(clearCookie).toContain('Max-Age=0')

    const reuse = await route.GET(
      new Request(`${appOrigin}/api/v1/session`, {
        headers: { cookie: `helpo_session=${token}` },
      }),
    )
    expect(reuse.status).toBe(401)
  })

  it('Origin不一致は403、Content-Type不適合は415', async () => {
    const { route, password, employeeId } = await setupRoute()

    const originMismatch = await route.POST(
      new Request(`${appOrigin}/api/v1/session`, {
        method: 'POST',
        headers: { origin: 'http://evil.example', 'content-type': 'application/json' },
        body: JSON.stringify({ employeeId, password }),
      }),
    )
    expect(originMismatch.status).toBe(403)

    const unsupportedMedia = await route.POST(
      new Request(`${appOrigin}/api/v1/session`, {
        method: 'POST',
        headers: { origin: appOrigin, 'content-type': 'text/plain' },
        body: JSON.stringify({ employeeId, password }),
      }),
    )
    expect(unsupportedMedia.status).toBe(415)
  })
})
