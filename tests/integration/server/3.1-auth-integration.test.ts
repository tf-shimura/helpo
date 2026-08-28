import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { hash } from 'argon2'
import { createPrismaClient, initializePrisma } from '../../../src/infrastructure/db/prisma'
import { PrismaAccountRepository } from '../../../src/infrastructure/db/account-repository'
import { PrismaSessionRepository } from '../../../src/infrastructure/db/session-repository'
import { AuthService } from '../../../src/application/auth/auth-service'
import { ManualClock } from '../../../src/shared/mock/manual-clock'
import { Argon2PasswordVerifier } from '../../../src/infrastructure/security/argon2-password'
import { RandomSessionTokenizer } from '../../../src/shared/security/session-token'

const temporaryDirectories: string[] = []
const prismaCli = resolve('node_modules/prisma/build/index.js')

async function createAuthContext() {
  const directory = await mkdtemp(join(tmpdir(), 'helpo-auth-'))
  temporaryDirectories.push(directory)
  const databaseUrl = `file:${join(directory, 'test.db')}`
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
  })
  const password = 'training-pass'
  const passwordHash = await hash(password, {
    type: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
  })
  const prisma = createPrismaClient(databaseUrl)
  await initializePrisma(prisma)
  const account = await prisma.account.create({
    data: { employeeId: 'E010', passwordHash, role: 'EMPLOYEE' },
  })
  const clock = new ManualClock(new Date('2026-08-28T00:00:00.000Z'))
  const service = new AuthService(
    new PrismaAccountRepository(prisma),
    new PrismaSessionRepository(prisma),
    new Argon2PasswordVerifier(),
    new RandomSessionTokenizer(),
    clock,
  )
  return { service, clock, prisma, account, password }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('AuthService integration with Prisma', () => {
  it('正規のログイン・ロック・セッション永続化を実現する', async () => {
    const { service, clock, prisma, account, password } = await createAuthContext()

    const login = await service.login({ employeeId: 'E010', password })
    expect(login.ok).toBe(true)
    if (!login.ok) return
    expect(login.value.actor.employeeId).toBe('E010')
    expect(login.value.actor.role).toBe('EMPLOYEE')

    const authenticated = await service.authenticate(login.value.rawToken)
    expect(authenticated.ok).toBe(true)
    if (!authenticated.ok) return
    expect(authenticated.value.employeeId).toBe('E010')

    // 24時間直前は有効
    clock.advanceBy(24 * 60 * 60 * 1000 - 1)
    expect((await service.authenticate(login.value.rawToken)).ok).toBe(true)

    // 24時間ちょうどで期限切れ
    clock.advanceBy(1)
    const expired = await service.authenticate(login.value.rawToken)
    expect(expired.ok).toBe(false)
    if (!expired.ok) expect(expired.error.kind).toBe('unauthenticated')

    // ロック後の再起動直後も失敗カウントが永続化されている
    const freshClock = new ManualClock(new Date('2026-08-28T00:00:00.000Z'))
    const freshService = new AuthService(
      new PrismaAccountRepository(prisma),
      new PrismaSessionRepository(prisma),
      new Argon2PasswordVerifier(),
      new RandomSessionTokenizer(),
      freshClock,
    )
    for (let i = 1; i <= 4; i += 1) {
      const wrong = await freshService.login({ employeeId: 'E010', password: 'wrong' })
      expect(wrong.ok).toBe(false)
      if (!wrong.ok) expect(wrong.error.kind).toBe('unauthenticated')
    }
    const fifth = await freshService.login({ employeeId: 'E010', password: 'wrong' })
    expect(fifth.ok).toBe(false)
    if (!fifth.ok) {
      expect(fifth.error.kind).toBe('locked')
      expect(fifth.error.code).toBe('LOGIN_LOCKED')
    }

    // ロック中は正しいパスワードも拒否
    const locked = await freshService.login({ employeeId: 'E010', password })
    expect(locked.ok).toBe(false)
    if (!locked.ok) expect(locked.error.kind).toBe('locked')
  })
})
