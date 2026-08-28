import type { ManualClock } from './manual-clock'

export type Role = 'employee' | 'admin'
export type Feedback = 'good' | 'bad'

export type MockAccount = {
  id: string
  employeeId: string
  password: string
  name: string
  role: Role
}

export type MockSession = {
  accountId: string
  startedAt: Date
  expiresAt: Date
}

export type MockFaq = {
  id: string
  question: string
  answer: string
}

export type MockHistory = {
  id: string
  accountId: string
  askedAt: Date
  question: string
  answer: string
  feedback: Feedback | null
}

export type AuthenticationResult =
  | { status: 'authenticated'; account: MockAccount }
  | { status: 'invalid' }
  | { status: 'locked'; lockedUntil: Date }

export type AnswerScenario =
  | { kind: 'answer'; answer: string; sources: string[] }
  | { kind: 'unavailable' }
  | { kind: 'failure' }

const TEN_MINUTES = 10 * 60 * 1000
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000

const INITIAL_ACCOUNTS: readonly MockAccount[] = [
  { id: 'employee-1', employeeId: 'E001', password: 'employee-pass', name: '山田 太郎', role: 'employee' },
  { id: 'admin-1', employeeId: 'A001', password: 'admin-pass', name: '管理 花子', role: 'admin' },
]

const INITIAL_FAQS: readonly MockFaq[] = [
  {
    id: 'faq-1',
    question: '有給休暇はいつまでに申請すればよいですか？',
    answer: '原則として取得希望日の3営業日前までに勤怠システムから申請してください。',
  },
]

type MockStoreOptions = {
  faqs?: readonly MockFaq[]
  histories?: readonly MockHistory[]
  loginAttempts?: Readonly<Record<string, { failures: number; lockedUntil: Date | null }>>
  session?: MockSession | null
}

function nextNumericId(prefix: string, ids: readonly string[]): number {
  const used = new Set(ids)
  let next = 1
  while (used.has(`${prefix}-${next}`)) next += 1
  return next
}

export function createMockStore(clock: ManualClock, options: MockStoreOptions = {}) {
  const accounts = INITIAL_ACCOUNTS.map((account) => ({ ...account }))
  const faqs = (options.faqs ?? INITIAL_FAQS).map((faq) => ({ ...faq }))
  const histories = (options.histories ?? []).map((entry) => ({ ...entry, askedAt: new Date(entry.askedAt) }))
  const loginAttempts = new Map(
    Object.entries(options.loginAttempts ?? {}).map(([employeeId, attempts]) => [
      employeeId,
      { failures: attempts.failures, lockedUntil: attempts.lockedUntil ? new Date(attempts.lockedUntil) : null },
    ]),
  )
  let session = options.session
    ? {
        accountId: options.session.accountId,
        startedAt: new Date(options.session.startedAt),
        expiresAt: new Date(options.session.expiresAt),
      }
    : null
  const activeSession = (): MockSession | null => {
    if (session && clock.now().getTime() >= session.expiresAt.getTime()) session = null
    return session
  }
  const currentAccount = (): MockAccount | null => {
    const current = activeSession()
    return accounts.find((candidate) => candidate.id === current?.accountId) ?? null
  }

  return {
    authenticate(employeeId: string, password: string): AuthenticationResult {
      const attempts = loginAttempts.get(employeeId) ?? { failures: 0, lockedUntil: null }
      const now = clock.now()
      if (attempts.lockedUntil && now.getTime() < attempts.lockedUntil.getTime()) {
        return { status: 'locked', lockedUntil: new Date(attempts.lockedUntil) }
      }
      if (attempts.lockedUntil) {
        attempts.lockedUntil = null
        attempts.failures = 0
      }

      const account = accounts.find((candidate) => candidate.employeeId === employeeId && candidate.password === password)
      if (account) {
        loginAttempts.set(employeeId, { failures: 0, lockedUntil: null })
        session = {
          accountId: account.id,
          startedAt: new Date(now),
          expiresAt: new Date(now.getTime() + TWENTY_FOUR_HOURS),
        }
        return { status: 'authenticated', account: { ...account } }
      }

      attempts.failures += 1
      if (attempts.failures === 5) {
        attempts.failures = 0
        attempts.lockedUntil = new Date(now.getTime() + TEN_MINUTES)
        loginAttempts.set(employeeId, attempts)
        return { status: 'locked', lockedUntil: new Date(attempts.lockedUntil) }
      }
      loginAttempts.set(employeeId, attempts)
      return { status: 'invalid' }
    },

    logout(): void {
      session = null
    },

    getSession(): MockSession | null {
      const current = activeSession()
      return current
        ? {
            accountId: current.accountId,
            startedAt: new Date(current.startedAt),
            expiresAt: new Date(current.expiresAt),
          }
        : null
    },

    getCurrentUser(): MockAccount | null {
      const account = currentAccount()
      return account ? { ...account } : null
    },

    getFaqs(): MockFaq[] {
      return faqs.map((faq) => ({ ...faq }))
    },

    addFaq(question: string, answer: string): MockFaq {
      if (faqs.some((faq) => faq.question === question)) throw new Error('同じ質問が登録済みです')
      const faq = { id: `faq-${nextNumericId('faq', faqs.map(({ id }) => id))}`, question, answer }
      faqs.push(faq)
      return { ...faq }
    },

    updateFaq(id: string, question: string, answer: string): MockFaq {
      const faq = faqs.find((candidate) => candidate.id === id)
      if (!faq) throw new Error('FAQが見つかりません')
      if (faqs.some((candidate) => candidate.id !== id && candidate.question === question)) {
        throw new Error('同じ質問が登録済みです')
      }
      faq.question = question
      faq.answer = answer
      return { ...faq }
    },

    getAnswerScenario(question: string): AnswerScenario {
      if (question === '__ERROR__') return { kind: 'failure' }
      const sources = question === '__MULTI__' ? faqs : faqs.filter((faq) => faq.question === question)
      if (sources.length === 0) return { kind: 'unavailable' }
      return {
        kind: 'answer',
        answer: sources.map((faq) => faq.answer).join('\n'),
        sources: sources.map((faq) => faq.id),
      }
    },

    addHistory(question: string, answer: string): MockHistory {
      const account = currentAccount()
      if (!account) throw new Error('ログインが必要です')
      const entry = {
        id: `history-${nextNumericId('history', histories.map(({ id }) => id))}`,
        accountId: account.id,
        askedAt: clock.now(),
        question,
        answer,
        feedback: null,
      }
      histories.push(entry)
      return { ...entry, askedAt: new Date(entry.askedAt) }
    },

    getHistory(): MockHistory[] {
      const account = currentAccount()
      if (!account) return []
      return histories
        .filter((entry) => entry.accountId === account.id)
        .sort((left, right) => right.askedAt.getTime() - left.askedAt.getTime())
        .map((entry) => ({ ...entry, askedAt: new Date(entry.askedAt) }))
    },

    rateAnswer(historyId: string, feedback: Feedback): boolean {
      const account = currentAccount()
      if (!account) return false
      const entry = histories.find((candidate) => candidate.id === historyId && candidate.accountId === account.id)
      if (!entry || entry.feedback) return false
      entry.feedback = feedback
      return true
    },
  }
}
