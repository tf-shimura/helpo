import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { hash, verify } from 'argon2'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryDirectories: string[] = []
const prismaCli = resolve('node_modules/prisma/build/index.js')

async function migrateAndSeed(seedHash?: string) {
  const directory = await mkdtemp(join(tmpdir(), 'helpo-schema-'))
  temporaryDirectories.push(directory)
  const databasePath = join(directory, 'test.db')
  const databaseUrl = `file:${databasePath}`
  const passwordHash = seedHash ?? await hash(randomUUID(), { type: 2, memoryCost: 19456, timeCost: 2, parallelism: 1, hashLength: 32 })
  const environment = { ...process.env, DATABASE_URL: databaseUrl, SEED_EMPLOYEE_PASSWORD_HASH: passwordHash }
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { env: environment })
  execFileSync(process.execPath, [prismaCli, 'db', 'seed'], { env: environment })
  return { databasePath, passwordHash }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('Prisma schema migration and training seed', () => {
  it('空のSQLiteへ全model・制約・indexを再現する', async () => {
    const { databasePath } = await migrateAndSeed()
    const database = new DatabaseSync(databasePath, { readOnly: true })
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(({ name }) => name)
    const indexes = database.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map(({ name }) => name)
    database.close()

    expect(tables).toEqual(expect.arrayContaining(['Account', 'Session', 'Faq', 'AnswerHistory', 'AnswerSource', 'Feedback']))
    expect(indexes).toEqual(expect.arrayContaining([
      'Account_employeeId_key',
      'Session_tokenHash_key',
      'Session_accountId_expiresAt_idx',
      'Faq_question_key',
      'AnswerHistory_accountId_askedAt_idx',
      'AnswerSource_answerId_ordinal_key',
      'Feedback_answerId_key',
    ]))
  }, 10000)

  it.each(['', '$argon2id$garbage', '$argon2i$v=19$m=19456,t=2,p=1$c2FsdA$ZGlnZXN0', '$argon2id$v=19$m=1024,t=1,p=1$c2FsdA$ZGlnZXN0'])(
    '不正または弱いArgon2id hash %sを値非表示で拒否する',
    async (passwordHash) => {
      await expect(migrateAndSeed(passwordHash)).rejects.toThrow()
    },
  )

  it('平文passwordなしで一般社員と管理者社員をArgon2id hashとしてseedする', async () => {
    const { databasePath, passwordHash } = await migrateAndSeed()
    const database = new DatabaseSync(databasePath, { readOnly: true })
    const accounts = database.prepare('SELECT employeeId, passwordHash, role FROM Account ORDER BY employeeId').all()
    database.close()

    expect(accounts).toEqual([
      { employeeId: 'A001', passwordHash, role: 'ADMIN' },
      { employeeId: 'E001', passwordHash, role: 'EMPLOYEE' },
    ])
    expect(await verify(passwordHash, randomUUID())).toBe(false)
  })
})
