import type { MockApiError } from './mock-api-client'

export type MockUiOutcome = '再認証' | '権限拒否' | '入力修正' | '再取得' | '再試行' | '一般エラー'

export function mapMockError(error: MockApiError): MockUiOutcome {
  switch (error.code) {
    case 'UNAUTHENTICATED': return '再認証'
    case 'FORBIDDEN': return '権限拒否'
    case 'INVALID_CREDENTIALS': return '入力修正'
    case 'FAQ_QUESTION_CONFLICT':
    case 'FEEDBACK_CONFLICT':
    case 'NOT_FOUND': return '再取得'
    case 'LOGIN_LOCKED': return '再試行'
    default: return '一般エラー'
  }
}
