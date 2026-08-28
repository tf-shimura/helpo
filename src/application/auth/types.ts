import type { Account } from '../ports'

export type Actor = Readonly<{
  accountId: string
  employeeId: string
  role: Account['role']
}>

export type LoginInput = Readonly<{
  employeeId: string
  password: string
}>

export type LoginResult = Readonly<{
  actor: Actor
  rawToken: string
  expiresAt: Date
}>
