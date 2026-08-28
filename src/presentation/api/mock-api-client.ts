import type { createMockStore, Feedback, MockAccount, MockFaq, MockHistory } from '../../shared/mock/mock-store'

type MockStore = ReturnType<typeof createMockStore>

export type MockApiErrorCode = 'INVALID_CREDENTIALS' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'FAQ_QUESTION_CONFLICT' | 'FEEDBACK_CONFLICT' | 'LOGIN_LOCKED' | 'UNKNOWN_RESPONSE'
export type MockApiError = Readonly<{ ok: false; status: number; code: MockApiErrorCode; message: string }>
export type MockResult<T> = Readonly<{ ok: true; value: T }> | MockApiError

export interface MockApiClient {
  login(employeeId: string, password: string): Promise<MockResult<MockAccount>>
  getSession(): Promise<MockResult<MockAccount>>
  logout(): Promise<MockResult<void>>
  listFaqs(): Promise<MockResult<readonly MockFaq[]>>
  createFaq(question: string, answer: string): Promise<MockResult<MockFaq>>
  updateFaq(id: string, question: string, answer: string): Promise<MockResult<MockFaq>>
  listHistory(): Promise<MockResult<readonly MockHistory[]>>
  submitFeedback(id: string, feedback: Feedback): Promise<MockResult<void>>
}

const success = <T>(value: T): MockResult<T> => ({ ok: true, value })
const failure = (status: number, code: MockApiErrorCode, message: string): MockApiError => ({ ok: false, status, code, message })

export function createMockApiClient(store: MockStore): MockApiClient {
  return {
    async login(employeeId, password) {
      const result = store.authenticate(employeeId, password)
      if (result.status === 'authenticated') return success(result.account)
      if (result.status === 'locked') return failure(423, 'LOGIN_LOCKED', 'ログインがロックされています')
      return failure(401, 'INVALID_CREDENTIALS', '社員IDまたはパスワードが正しくありません')
    },
    async getSession() {
      const account = store.getCurrentUser()
      return account ? success(account) : failure(401, 'UNAUTHENTICATED', 'ログインが必要です')
    },
    async logout() {
      store.logout()
      return success(undefined)
    },
    async listFaqs() {
      if (!store.getCurrentUser()) return failure(401, 'UNAUTHENTICATED', 'ログインが必要です')
      return success(store.getFaqs())
    },
    async createFaq(question, answer) {
      try { return success(store.addFaq(question, answer)) } catch (error) { return mapStoreError(error) }
    },
    async updateFaq(id, question, answer) {
      try { return success(store.updateFaq(id, question, answer)) } catch (error) { return mapStoreError(error) }
    },
    async listHistory() {
      if (!store.getCurrentUser()) return failure(401, 'UNAUTHENTICATED', 'ログインが必要です')
      return success(store.getHistory())
    },
    async submitFeedback(id, feedback) {
      if (!store.getCurrentUser()) return failure(401, 'UNAUTHENTICATED', 'ログインが必要です')
      return store.rateAnswer(id, feedback) ? success(undefined) : failure(409, 'FEEDBACK_CONFLICT', '評価はすでに登録されています')
    },
  }
}

function mapStoreError(error: unknown): MockApiError {
  const message = error instanceof Error ? error.message : '操作に失敗しました'
  if (message === 'ログインが必要です') return failure(401, 'UNAUTHENTICATED', message)
  if (message === '権限がありません') return failure(403, 'FORBIDDEN', message)
  if (message === '同じ質問が登録済みです') return failure(409, 'FAQ_QUESTION_CONFLICT', message)
  if (message === 'FAQが見つかりません') return failure(404, 'NOT_FOUND', message)
  return failure(400, 'UNKNOWN_RESPONSE', message)
}
