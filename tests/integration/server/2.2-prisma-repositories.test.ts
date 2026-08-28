// @vitest-environment node

import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, afterEach } from 'vitest'
import { createTestDatabase } from '../../fixtures/test-database'
import { createPrismaClient, initializePrisma } from '../../../src/infrastructure/db/prisma'
import { PrismaAccountRepository } from '../../../src/infrastructure/db/account-repository'
import { PrismaSessionRepository } from '../../../src/infrastructure/db/session-repository'
import { PrismaFaqRepository } from '../../../src/infrastructure/db/faq-repository'
import { PrismaHistoryRepository } from '../../../src/infrastructure/db/history-repository'
import { PrismaFeedbackRepository } from '../../../src/infrastructure/db/feedback-repository'

const temporaryDirectories: string[] = []
const prismaCli = resolve('node_modules/prisma/build/index.js')

async function createRepositoryContext() {
  const directory = await mkdtemp(join(tmpdir(), 'helpo-repos-'))
  temporaryDirectories.push(directory)
  const databaseUrl = `file:${join(directory, 'test.db')}`
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
  })
  const prisma = createPrismaClient(databaseUrl)
  await initializePrisma(prisma)
  return {
    prisma,
    accountRepo: new PrismaAccountRepository(prisma),
    sessionRepo: new PrismaSessionRepository(prisma),
    faqRepo: new PrismaFaqRepository(prisma),
    historyRepo: new PrismaHistoryRepository(prisma),
    feedbackRepo: new PrismaFeedbackRepository(prisma),
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('Prisma repositories', () => {
  it('SQLite接続をWAL・foreign keysで初期化する', async () => {
    const { prisma } = await createRepositoryContext()
    const [{ foreign_keys: foreignKeys }] = await prisma.$queryRaw<{ foreign_keys: bigint }[]>`PRAGMA foreign_keys`
    const [{ journal_mode: journalMode }] = await prisma.$queryRaw<{ journal_mode: string }[]>`PRAGMA journal_mode`
    expect(foreignKeys).toBe(1n)
    expect(journalMode).toBe('wal')
  })

  it('AccountRepositoryが社員ID検索とlock state更新を行う', async () => {
    const { prisma, accountRepo } = await createRepositoryContext()
    const created = await prisma.account.create({
      data: { employeeId: 'E002', passwordHash: 'hash', role: 'EMPLOYEE' },
    })

    const found = await accountRepo.findByEmployeeId('E002')
    expect(found).toEqual({
      id: created.id,
      employeeId: 'E002',
      passwordHash: 'hash',
      role: 'EMPLOYEE',
      failedCount: 0,
      lockedUntil: null,
    })

    const lockedUntil = new Date('2026-01-01T00:10:00.000Z')
    const updated = await accountRepo.updateLockState('E002', { failedCount: 1, lockedUntil })
    expect(updated).toEqual({
      ok: true,
      value: { id: created.id, employeeId: 'E002', passwordHash: 'hash', role: 'EMPLOYEE', failedCount: 1, lockedUntil },
    })

    const missing = await accountRepo.updateLockState('E999', { failedCount: 0, lockedUntil: null })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.kind).toBe('not_found')
  })

  it('SessionRepositoryがtoken hash発行・検索・失効を行う', async () => {
    const { prisma, sessionRepo } = await createRepositoryContext()
    const account = await prisma.account.create({
      data: { employeeId: 'E003', passwordHash: 'hash', role: 'EMPLOYEE' },
    })
    const expiresAt = new Date('2026-01-02T00:00:00.000Z')
    const created = await sessionRepo.create({ accountId: account.id, tokenHash: 'hash1', expiresAt })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const found = await sessionRepo.findByTokenHash('hash1')
    expect(found?.id).toBe(created.value.id)
    expect(found?.account.employeeId).toBe('E003')
    expect(found?.revokedAt).toBeNull()

    const revoked = await sessionRepo.revoke(created.value.id, new Date('2026-01-01T00:00:00.000Z'))
    expect(revoked.ok).toBe(true)

    const afterRevoke = await sessionRepo.findByTokenHash('hash1')
    expect(afterRevoke?.revokedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'))

    const missing = await sessionRepo.revoke(randomUUID(), new Date())
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.kind).toBe('not_found')
  })

  it('FaqRepositoryが一覧・登録・重複更新を扱う', async () => {
    const { faqRepo } = await createRepositoryContext()
    const a = await faqRepo.create({ question: 'Q1', answer: 'A1' })
    const b = await faqRepo.create({ question: 'Q2', answer: 'A2' })
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return

    const list = await faqRepo.list()
    expect(list).toHaveLength(2)
    expect(list.map((f) => f.question)).toEqual(['Q2', 'Q1'])

    const duplicate = await faqRepo.create({ question: 'Q1', answer: 'A3' })
    expect(duplicate.ok).toBe(false)
    if (!duplicate.ok) expect(duplicate.error.code).toBe('FAQ_QUESTION_CONFLICT')

    const updated = await faqRepo.update(a.value.id, { question: 'Q1-updated', answer: 'A1-updated' })
    expect(updated.ok).toBe(true)

    const conflictUpdate = await faqRepo.update(b.value.id, { question: 'Q1-updated', answer: 'A2' })
    expect(conflictUpdate.ok).toBe(false)
    if (!conflictUpdate.ok) expect(conflictUpdate.error.code).toBe('FAQ_QUESTION_CONFLICT')

    const missing = await faqRepo.update(randomUUID(), { question: 'Q3', answer: 'A3' })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.kind).toBe('not_found')
  })

  it('HistoryRepositoryが完了・回答不能をtransaction保存し、本人履歴を新しい順に返す', async () => {
    const { prisma, historyRepo, faqRepo } = await createRepositoryContext()
    const account = await prisma.account.create({
      data: { employeeId: 'E004', passwordHash: 'hash', role: 'EMPLOYEE' },
    })
    const other = await prisma.account.create({
      data: { employeeId: 'E005', passwordHash: 'hash', role: 'EMPLOYEE' },
    })
    const faq = await faqRepo.create({ question: 'Q', answer: 'A' })
    expect(faq.ok).toBe(true)
    if (!faq.ok) return

    const complete = await historyRepo.commitComplete({
      answerId: randomUUID(),
      accountId: account.id,
      question: '問1',
      answer: '答1',
      sources: [{ faqId: faq.value.id, faqQuestion: 'Q', exactQuote: 'A', ordinal: 0 }],
    })
    expect(complete.ok).toBe(true)
    if (!complete.ok) return
    expect(complete.value.sources).toHaveLength(1)
    expect(complete.value.feedback).toBeNull()

    const unanswerable = await historyRepo.commitUnanswerable({
      answerId: randomUUID(),
      accountId: account.id,
      question: '問2',
      reason: 'NO_GROUNDING',
    })
    expect(unanswerable.ok).toBe(true)

    const list = await historyRepo.listByAccountId(account.id)
    expect(list).toHaveLength(2)
    expect(list[0].question).toBe('問2')
    expect(list[1].question).toBe('問1')

    const otherList = await historyRepo.listByAccountId(other.id)
    expect(otherList).toHaveLength(0)
  })

  it('FeedbackRepositoryが一回限り評価と競合・未存在answerを扱う', async () => {
    const { prisma, historyRepo, faqRepo, feedbackRepo } = await createRepositoryContext()
    const account = await prisma.account.create({
      data: { employeeId: 'E006', passwordHash: 'hash', role: 'EMPLOYEE' },
    })
    const faq = await faqRepo.create({ question: 'Q', answer: 'A' })
    expect(faq.ok).toBe(true)
    if (!faq.ok) return

    const history = await historyRepo.commitComplete({
      answerId: randomUUID(),
      accountId: account.id,
      question: '問',
      answer: '答',
      sources: [{ faqId: faq.value.id, faqQuestion: 'Q', exactQuote: 'A', ordinal: 0 }],
    })
    expect(history.ok).toBe(true)
    if (!history.ok) return

    const first = await feedbackRepo.create({ answerId: history.value.id, accountId: account.id, value: 'GOOD' })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.value.value).toBe('GOOD')

    const duplicate = await feedbackRepo.create({ answerId: history.value.id, accountId: account.id, value: 'BAD' })
    expect(duplicate.ok).toBe(false)
    if (!duplicate.ok) expect(duplicate.error.code).toBe('FEEDBACK_CONFLICT')

    const missing = await feedbackRepo.create({ answerId: randomUUID(), accountId: account.id, value: 'GOOD' })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.kind).toBe('not_found')
  })
})
