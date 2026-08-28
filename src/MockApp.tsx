import { useEffect, useState } from 'react'
import { AuthenticatedNavigation } from './components/authenticated-navigation'
import AskPage from './views/AskPage'
import { FaqAdminPage } from './views/faq-admin-page'
import { FaqPage } from './views/faq-page'
import { HistoryPage } from './views/history-page'
import { LoginPage } from './views/LoginPage'
import { ControlledAnswer } from './shared/mock/controlled-answer'
import type { createMockStore, Role } from './shared/mock/mock-store'
import { resolveScreen, type RequestedScreen } from './shared/mock/screen-access'

type MockStore = ReturnType<typeof createMockStore>

type MockAppProps = {
  requestedScreen: RequestedScreen
  role?: Role | null
  store?: MockStore
}

export function MockApp({ requestedScreen, role = null, store }: MockAppProps) {
  const [currentScreen, setCurrentScreen] = useState(requestedScreen)
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null)
  const [, refresh] = useState(0)
  useEffect(() => {
    setCurrentScreen(requestedScreen)
    setEditingFaqId(null)
  }, [requestedScreen])
  const currentRole = store?.getCurrentUser()?.role ?? role
  const { screen } = resolveScreen(currentScreen, currentRole)

  const logout = () => {
    store?.logout()
    setCurrentScreen('login')
    refresh((value) => value + 1)
  }

  if (screen === 'login' && store) {
    return <LoginPage authenticate={(employeeId, password) => store.authenticate(employeeId, password)} onAuthenticated={() => { setCurrentScreen('question'); refresh((value) => value + 1) }} />
  }
  if (screen === 'login') return <main><h1>ログイン</h1></main>
  const navigate = (nextScreen: 'question' | 'history' | 'faq') => setCurrentScreen(nextScreen)
  if (screen === 'question') {
    return <AskPage onLogout={store ? logout : undefined} onNavigate={navigate} createAnswer={store ? (question) => {
      const scenario = store.getAnswerScenario(question)
      if (scenario.kind === 'unavailable') return new ControlledAnswer([], [], 'unavailable')
      if (scenario.kind === 'failure') return new ControlledAnswer([], [], 'failed')
      const faqQuestions = new Map(store.getFaqs().map((faq) => [faq.id, faq.question]))
      const sources = scenario.sources.flatMap((id) => faqQuestions.get(id) ?? [])
      const midpoint = Math.max(1, Math.ceil(scenario.answer.length / 2))
      return new ControlledAnswer([scenario.answer.slice(0, midpoint), scenario.answer.slice(midpoint)].filter(Boolean), sources)
    } : undefined} createAnswerRecord={store ? () => store.addGeneratedAnswer().id : undefined} rateAnswer={store ? (id, feedback) => store.rateGeneratedAnswer(id, feedback) : undefined} />
  }
  if (screen === 'forbidden') return <p role="alert">権限がありません</p>

  const current = screen === 'faq-admin' ? null : screen
  const faqs = store?.getFaqs() ?? []
  const editFaq = (id: string) => {
    setEditingFaqId(id)
    setCurrentScreen('faq-admin')
  }
  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <AuthenticatedNavigation current={current} onNavigate={navigate} onLogout={store ? logout : undefined} />
      <main className="grid place-items-center p-6">
        {screen === 'history' && <HistoryPage entries={store?.getHistory() ?? []} />}
        {screen === 'faq' && <FaqPage faqs={faqs} role={currentRole!} onCreate={() => { setEditingFaqId(null); setCurrentScreen('faq-admin') }} onEdit={editFaq} />}
        {screen === 'faq-admin' && <>
          <h2 className="sr-only">FAQ管理</h2>
          <FaqAdminPage
            key={editingFaqId ?? 'new'}
            faq={faqs.find(({ id }) => id === editingFaqId) ?? null}
            onCreate={(question, answer) => store?.addFaq(question, answer)}
            onUpdate={(id, question, answer) => store?.updateFaq(id, question, answer)}
          />
        </>}
      </main>
    </div>
  )
}
