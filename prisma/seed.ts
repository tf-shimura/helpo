import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient, Role } from '../src/generated/prisma/client'

function validatePasswordHash(passwordHash: string | undefined): passwordHash is string {
  if (!passwordHash) return false
  const parts = passwordHash.split('$')
  const parameters = parts[3]?.split(',').map((parameter: string) => parameter.split('='))
  const parsedParameters = parameters?.every((parameter: string[]) => parameter.length === 2)
    ? Object.fromEntries(parameters)
    : undefined
  return (
    parts.length === 6 &&
    parts[1] === 'argon2id' &&
    parts[2] === 'v=19' &&
    /^[A-Za-z0-9+/]+$/.test(parts[4]) &&
    /^[A-Za-z0-9+/]+$/.test(parts[5]) &&
    Number(parsedParameters?.m) >= 19456 &&
    Number(parsedParameters?.t) >= 2 &&
    Number(parsedParameters?.p) >= 1
  )
}

const employeePasswordHash = process.env.SEED_EMPLOYEE_PASSWORD_HASH
const adminPasswordHash = process.env.SEED_ADMIN_PASSWORD_HASH ?? employeePasswordHash
if (!validatePasswordHash(employeePasswordHash) || !validatePasswordHash(adminPasswordHash)) {
  throw new Error('Seed password hash is missing or invalid')
}

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? 'file:./dev.db' })
const prisma = new PrismaClient({ adapter })

try {
  await Promise.all([
    prisma.account.upsert({
      where: { employeeId: 'A001' },
      update: { passwordHash: adminPasswordHash, role: Role.ADMIN },
      create: { employeeId: 'A001', passwordHash: adminPasswordHash, role: Role.ADMIN },
    }),
    prisma.account.upsert({
      where: { employeeId: 'E001' },
      update: { passwordHash: employeePasswordHash, role: Role.EMPLOYEE },
      create: { employeeId: 'E001', passwordHash: employeePasswordHash, role: Role.EMPLOYEE },
    }),
  ])
} finally {
  await prisma.$disconnect()
}
