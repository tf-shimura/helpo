import type { Account, AccountRepository, SessionRepository, SessionWithAccount } from '../ports'
import type { Result } from '../../shared/http/api-error'
import type { Clock } from '../../shared/time/clock'
import type { PasswordVerifier } from '../../shared/security/password-verifier'
import type { SessionTokenizer } from '../../shared/security/session-token'
import type { Actor, LoginInput, LoginResult } from './types'

const LOCK_DURATION_MS = 10 * 60 * 1000
const SESSION_TTL_MS = 24 * 60 * 60 * 1000

export class AuthService {
  constructor(
    private readonly accountRepo: AccountRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly passwordVerifier: PasswordVerifier,
    private readonly tokenizer: SessionTokenizer,
    private readonly clock: Clock,
  ) {}

  async login(input: LoginInput): Promise<Result<LoginResult>> {
    const now = this.clock.now()
    const account = await this.accountRepo.findByEmployeeId(input.employeeId)
    if (!account) {
      return { ok: false, error: { kind: 'unauthenticated', code: 'INVALID_CREDENTIALS' } }
    }
    if (account.lockedUntil !== null && account.lockedUntil > now) {
      return { ok: false, error: { kind: 'locked', code: 'LOGIN_LOCKED', retryAt: account.lockedUntil } }
    }
    const valid = await this.passwordVerifier.verify(input.password, account.passwordHash)
    if (valid) {
      const reset = await this.accountRepo.updateLockState(input.employeeId, { failedCount: 0, lockedUntil: null })
      if (!reset.ok) return { ok: false, error: reset.error }
      return this.createSession(account, now)
    }
    const nextFailedCount = account.failedCount + 1
    if (nextFailedCount < 5) {
      const updated = await this.accountRepo.updateLockState(input.employeeId, {
        failedCount: nextFailedCount,
        lockedUntil: null,
      })
      if (!updated.ok) return { ok: false, error: updated.error }
      return { ok: false, error: { kind: 'unauthenticated', code: 'INVALID_CREDENTIALS' } }
    }
    const lockedUntil = new Date(now.getTime() + LOCK_DURATION_MS)
    const updated = await this.accountRepo.updateLockState(input.employeeId, {
      failedCount: 0,
      lockedUntil,
    })
    if (!updated.ok) return { ok: false, error: updated.error }
    return { ok: false, error: { kind: 'locked', code: 'LOGIN_LOCKED', retryAt: lockedUntil } }
  }

  async authenticate(token: string): Promise<Result<Actor>> {
    const tokenHash = this.tokenizer.hash(token)
    const session = await this.sessionRepo.findByTokenHash(tokenHash)
    if (!session) {
      return { ok: false, error: { kind: 'unauthenticated', code: 'UNAUTHENTICATED' } }
    }
    const now = this.clock.now()
    if (session.revokedAt !== null || session.expiresAt <= now) {
      return { ok: false, error: { kind: 'unauthenticated', code: 'UNAUTHENTICATED' } }
    }
    return { ok: true, value: this.toActor(session.account) }
  }

  async logout(actor: Actor, token: string): Promise<Result<void>> {
    const tokenHash = this.tokenizer.hash(token)
    const session = await this.sessionRepo.findByTokenHash(tokenHash)
    if (!session) {
      return { ok: false, error: { kind: 'unauthenticated', code: 'UNAUTHENTICATED' } }
    }
    if (session.account.id !== actor.accountId) {
      return { ok: false, error: { kind: 'forbidden', code: 'FORBIDDEN' } }
    }
    const now = this.clock.now()
    if (session.revokedAt !== null || session.expiresAt <= now) {
      return { ok: false, error: { kind: 'unauthenticated', code: 'UNAUTHENTICATED' } }
    }
    return this.sessionRepo.revoke(session.id, now)
  }

  private async createSession(account: Account, now: Date): Promise<Result<LoginResult>> {
    const { rawToken, tokenHash } = this.tokenizer.generate()
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)
    const created = await this.sessionRepo.create({ accountId: account.id, tokenHash, expiresAt })
    if (!created.ok) return { ok: false, error: created.error }
    const actor = this.toActor(account)
    return { ok: true, value: { actor, rawToken, expiresAt } }
  }

  private toActor(account: Account | SessionWithAccount['account']): Actor {
    return {
      accountId: account.id,
      employeeId: account.employeeId,
      role: account.role,
    }
  }
}
