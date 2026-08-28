import { randomUUID } from 'node:crypto'

export type AppError =
  | { kind: 'validation'; code: string; fields?: Readonly<Record<string, readonly string[]>> }
  | { kind: 'unauthenticated'; code: string }
  | { kind: 'forbidden'; code: string }
  | { kind: 'not_found'; code: string }
  | { kind: 'conflict'; code: string }
  | { kind: 'locked'; code: 'LOGIN_LOCKED'; retryAt: Date }
  | { kind: 'dependency'; code: string; retryable: boolean }
  | { kind: 'internal'; code: string; requestId: string }

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError }

type ApiError = Readonly<{
  status: number
  body: Readonly<Record<string, unknown>>
}>

export function createRequestId(): string {
  return randomUUID()
}

export function toApiError(error: AppError, requestId: string = error.kind === 'internal' ? error.requestId : createRequestId()): ApiError {
  const envelope = (message: string, details: Readonly<Record<string, unknown>> = {}) => ({
    error: { requestId, code: error.code, message, ...details },
  })

  switch (error.kind) {
    case 'validation':
      return { status: 400, body: envelope('入力内容を確認してください', error.fields ? { fields: error.fields } : {}) }
    case 'unauthenticated':
      return { status: 401, body: envelope('認証が必要です') }
    case 'forbidden':
      return { status: 403, body: envelope('この操作は許可されていません') }
    case 'not_found':
      return { status: 404, body: envelope('対象が見つかりません') }
    case 'conflict':
      return { status: 409, body: envelope('現在の状態では操作できません') }
    case 'locked':
      return { status: 423, body: envelope('しばらく待ってから再試行してください') }
    case 'dependency':
      return { status: 503, body: envelope('一時的に利用できません') }
    case 'internal':
      return { status: 500, body: envelope('処理に失敗しました') }
  }
}
