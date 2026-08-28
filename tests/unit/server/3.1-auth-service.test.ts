import { describe, expect, it } from 'vitest'
import { AuthService } from '../../../src/application/auth/auth-service'
import { ManualClock } from '../../../src/shared/mock/manual-clock'
import type { Account, AccountRepository, Session, SessionRepository, SessionWithAccount } from '../../../src/application/ports'
import type { Result } from '../../../src/shared/http/api-error'
import type { Actor } from '../../../src/application/auth/types'
import type { PasswordVerifier } from '../../../src/shared/security/password-verifier'
import type { SessionTokenizer } from '../../../src/shared/security/session-token'

const startTime = new Date('2026-08-28T00:00:00.000Z')

class FakeAccountRepository implements AccountRepository {
  private accounts: Map<string, Account> = new Map()

  seed(account: Account): void {
    this.accounts.set(account.employeeId, { ...account })
  }

  async findByEmployeeId(employeeId: string): Promise<Account | null> {
    const account = this.accounts.get(employeeId)
    return account ? { ...account } : null
  }

  async updateLockState(
    employeeId: string,
    input: Readonly<{ failedCount: number; lockedUntil: Date | null }>,
  ): Promise<Result<Account>> {
    const account = this.accounts.get(employeeId)
    if (!account) return { ok: false, error: { kind: 'not_found', code: 'NOT_FOUND' } }
    const updated = { ...account, failedCount: input.failedCount, lockedUntil: input.lockedUntil }
    this.accounts.set(employeeId, updated)
    return { ok: true, value: { ...updated } }
  }
}

let sessionSeq = 0

class FakeSessionRepository implements SessionRepository {
  private sessions: Map<string, SessionWithAccount> = new Map()

  constructor(private readonly clock: ManualClock) {}

  async create(input: Readonly<{ accountId: string; tokenHash: string; expiresAt: Date }>): Promise<Result<Session>> {
    const account = accounts.find((a) => a.id === input.accountId)
    if (!account) return { ok: false, error: { kind: 'not_found', code: 'NOT_FOUND' } }
    const id = `session-${++sessionSeq}`
    const session: SessionWithAccount = {
      id,
      accountId: input.accountId,
      tokenHash: input.tokenHash,
      createdAt: this.clock.now(),
      expiresAt: input.expiresAt,
      revokedAt: null,
      account,
    }
    this.sessions.set(input.tokenHash, session)
    const { account: _, ...withoutAccount } = session
    return { ok: true, value: withoutAccount }
  }

  async findByTokenHash(tokenHash: string): Promise<SessionWithAccount | null> {
    const session = this.sessions.get(tokenHash)
    return session ? { ...session, account: { ...session.account } } : null
  }

  async revoke(sessionId: string, now: Date): Promise<Result<void>> {
    for (const [tokenHash, session] of this.sessions.entries()) {
      if (session.id === sessionId) {
        this.sessions.set(tokenHash, { ...session, revokedAt: now })
        return { ok: true, value: undefined }
      }
    }
    return { ok: false, error: { kind: 'not_found', code: 'NOT_FOUND' } }
  }
}

class FakePasswordVerifier implements PasswordVerifier {
  private valid = new Set<string>()

  add(password: string, hash: string): void {
    this.valid.add(`${password}:${hash}`)
  }

  async verify(password: string, hash: string): Promise<boolean> {
    return this.valid.has(`${password}:${hash}`)
  }
}

class FakeSessionTokenizer implements SessionTokenizer {
  private nextToken = 'raw-token-0'

  generate(): { rawToken: string; tokenHash: string } {
    const rawToken = this.nextToken
    this.nextToken = `raw-token-${Number(this.nextToken.split('-')[2]) + 1}`
    return { rawToken, tokenHash: this.hash(rawToken) }
  }

  hash(rawToken: string): string {
    return `hash-of-${rawToken}`
  }
}

const accounts: Account[] = [
  {
    id: 'account-1',
    employeeId: 'EMP001',
    passwordHash: 'hash-EMP001',
    role: 'EMPLOYEE',
    failedCount: 0,
    lockedUntil: null,
  },
  {
    id: 'account-2',
    employeeId: 'ADMIN001',
    passwordHash: 'hash-ADMIN001',
    role: 'ADMIN',
    failedCount: 0,
    lockedUntil: null,
  },
]

function makeService() {
  const accountRepo = new FakeAccountRepository()
  for (const account of accounts) accountRepo.seed(account)
  const clock = new ManualClock(startTime)
  const sessionRepo = new FakeSessionRepository(clock)
  const passwordVerifier = new FakePasswordVerifier()
  passwordVerifier.add('password', 'hash-EMP001')
  passwordVerifier.add('adminpass', 'hash-ADMIN001')
  const tokenizer = new FakeSessionTokenizer()
  const service = new AuthService(accountRepo, sessionRepo, passwordVerifier, tokenizer, clock)
  return { service, clock, accountRepo, sessionRepo, tokenizer }
}

describe('AuthService', () => {
  it('有効な資格情報でログインでき、失敗回数をリセットする', async () => {
    const { service, accountRepo } = makeService()
    await accountRepo.updateLockState('EMP001', { failedCount: 2, lockedUntil: null })
    const result = await service.login({ employeeId: 'EMP001', password: 'password' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.actor.employeeId).toBe('EMP001')
    expect(result.value.actor.role).toBe('EMPLOYEE')
    expect(result.value.expiresAt).toEqual(new Date(startTime.getTime() + 24 * 60 * 60 * 1000))
    const account = await accountRepo.findByEmployeeId('EMP001')
    expect(account?.failedCount).toBe(0)
    expect(account?.lockedUntil).toBeNull()
  })

  it('存在しない社員IDは存在確認を開示しない同一の認証失敗を返す', async () => {
    const { service } = makeService()
    const result = await service.login({ employeeId: 'UNKNOWN', password: 'password' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('unauthenticated')
    expect(result.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('パスワード不一致は1〜4回目まで INVALID_CREDENTIALS でカウントを増やす', async () => {
    const { service, accountRepo } = makeService()
    for (let i = 1; i <= 4; i += 1) {
      const result = await service.login({ employeeId: 'EMP001', password: 'wrong' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.kind).toBe('unauthenticated')
      expect(result.error.code).toBe('INVALID_CREDENTIALS')
      const account = await accountRepo.findByEmployeeId('EMP001')
      expect(account?.failedCount).toBe(i)
    }
  })

  it('5回目の失敗で10分ロックし、423 LOGIN_LOCKED を返す', async () => {
    const { service, accountRepo, clock } = makeService()
    for (let i = 1; i <= 4; i += 1) {
      await service.login({ employeeId: 'EMP001', password: 'wrong' })
    }
    const result = await service.login({ employeeId: 'EMP001', password: 'wrong' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    if (result.error.kind !== 'locked') throw new Error('expected locked')
    expect(result.error.code).toBe('LOGIN_LOCKED')
    expect(result.error.retryAt).toEqual(new Date(startTime.getTime() + 10 * 60 * 1000))
    const account = await accountRepo.findByEmployeeId('EMP001')
    expect(account?.failedCount).toBe(0)
    expect(account?.lockedUntil).toEqual(result.error.retryAt)
  })

  it('ロック中は正しいパスワードも拒否し、10分直前もまだロック', async () => {
    const { service, clock } = makeService()
    for (let i = 0; i < 5; i += 1) await service.login({ employeeId: 'EMP001', password: 'wrong' })
    clock.advanceBy(10 * 60 * 1000 - 1)
    const result = await service.login({ employeeId: 'EMP001', password: 'password' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('locked')
    expect(result.error.code).toBe('LOGIN_LOCKED')
  })

  it('10分ちょうどでロック解除され、次の失敗は1回目から数え直す', async () => {
    const { service, accountRepo, clock } = makeService()
    for (let i = 0; i < 5; i += 1) await service.login({ employeeId: 'EMP001', password: 'wrong' })
    clock.advanceBy(10 * 60 * 1000)
    const result = await service.login({ employeeId: 'EMP001', password: 'wrong' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('unauthenticated')
    expect(result.error.code).toBe('INVALID_CREDENTIALS')
    const account = await accountRepo.findByEmployeeId('EMP001')
    expect(account?.failedCount).toBe(1)
    expect(account?.lockedUntil).toBeNull()
  })

  it('有効なセッショントークンからActorを復元する', async () => {
    const { service, tokenizer } = makeService()
    const login = await service.login({ employeeId: 'EMP001', password: 'password' })
    if (!login.ok) throw new Error('login failed')
    const auth = await service.authenticate(login.value.rawToken)
    expect(auth.ok).toBe(true)
    if (!auth.ok) return
    expect(auth.value.employeeId).toBe('EMP001')
    expect(auth.value.role).toBe('EMPLOYEE')
  })

  it('トークンが無効・期限切れ・失効の場合は未認証を返す', async () => {
    const { service, clock, tokenizer } = makeService()
    const login = await service.login({ employeeId: 'EMP001', password: 'password' })
    if (!login.ok) throw new Error('login failed')
    clock.advanceBy(24 * 60 * 60 * 1000)
    const auth = await service.authenticate(login.value.rawToken)
    expect(auth.ok).toBe(false)
    if (auth.ok) return
    expect(auth.error.kind).toBe('unauthenticated')
  })

  it('ログアウトするとトークンが失効し、再利用できない', async () => {
    const { service } = makeService()
    const login = await service.login({ employeeId: 'EMP001', password: 'password' })
    if (!login.ok) throw new Error('login failed')
    const logout = await service.logout(login.value.actor, login.value.rawToken)
    expect(logout.ok).toBe(true)
    const auth = await service.authenticate(login.value.rawToken)
    expect(auth.ok).toBe(false)
    if (auth.ok) return
    expect(auth.error.kind).toBe('unauthenticated')
  })

  it('他社員のセッショントークンをログアウトしようとすると forbidden', async () => {
    const { service } = makeService()
    const empLogin = await service.login({ employeeId: 'EMP001', password: 'password' })
    const adminLogin = await service.login({ employeeId: 'ADMIN001', password: 'adminpass' })
    if (!empLogin.ok || !adminLogin.ok) throw new Error('login failed')
    const logout = await service.logout(empLogin.value.actor, adminLogin.value.rawToken)
    expect(logout.ok).toBe(false)
    if (logout.ok) return
    expect(logout.error.kind).toBe('forbidden')
  })
})
