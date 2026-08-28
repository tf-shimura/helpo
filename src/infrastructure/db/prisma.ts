import 'server-only'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../../generated/prisma/client'

let shared: PrismaClient | undefined

export function createPrismaClient(datasourceUrl: string): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: datasourceUrl })
  return new PrismaClient({ adapter })
}

export async function initializePrisma(prisma: PrismaClient): Promise<void> {
  await prisma.$queryRaw`PRAGMA foreign_keys = ON`
  await prisma.$queryRaw`PRAGMA journal_mode = WAL`
}

export function getPrisma(): PrismaClient {
  if (shared) return shared
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is not set')
  shared = createPrismaClient(databaseUrl)
  return shared
}

export function resetPrisma(): void {
  shared = undefined
}
