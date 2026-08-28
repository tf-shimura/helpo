import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient, Role } from '../src/generated/prisma/client'

const passwordHash = process.env.SEED_EMPLOYEE_PASSWORD_HASH
const parts = passwordHash?.split('$')
const parameters = parts?.[3]?.split(',').map((parameter) => parameter.split('='))
const parsedParameters = parameters?.every((parameter) => parameter.length === 2)
  ? Object.fromEntries(parameters)
  : undefined
const isValidHash =
  parts?.length === 6 &&
  parts[1] === 'argon2id' &&
  parts[2] === 'v=19' &&
  /^[A-Za-z0-9+/]+$/.test(parts[4]) &&
  /^[A-Za-z0-9+/]+$/.test(parts[5]) &&
  Number(parsedParameters?.m) >= 19456 &&
  Number(parsedParameters?.t) >= 2 &&
  Number(parsedParameters?.p) >= 1
if (!passwordHash || !isValidHash) throw new Error('Seed password hash is missing or invalid')

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? 'file:./dev.db' })
const prisma = new PrismaClient({ adapter })

try {
  await Promise.all([
    prisma.account.upsert({
      where: { employeeId: 'A001' },
      update: { passwordHash, role: Role.ADMIN },
      create: { employeeId: 'A001', passwordHash, role: Role.ADMIN },
    }),
    prisma.account.upsert({
      where: { employeeId: 'E001' },
      update: { passwordHash, role: Role.EMPLOYEE },
      create: { employeeId: 'E001', passwordHash, role: Role.EMPLOYEE },
    }),
  ])
} finally {
  await prisma.$disconnect()
}
