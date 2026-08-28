import { useEffect, useState } from 'react'
import AskPage from './pages/AskPage'
import { LoginPage } from './pages/LoginPage'
import type { createMockStore, Role } from './shared/mock/mock-store'
import { resolveScreen, type RequestedScreen } from './shared/mock/screen-access'

type MockStore = ReturnType<typeof createMockStore>

type MockAppProps = {
  requestedScreen: RequestedScreen
  role?: Role | null
  store?: MockStore
}

const screenHeadings = {
  login: 'ログイン',
  history: '質問履歴',
  faq: 'FAQ閲覧',
  'faq-admin': 'FAQ管理',
} as const

export function MockApp({ requestedScreen, role = null, store }: MockAppProps) {
  const [currentScreen, setCurrentScreen] = useState(requestedScreen)
  const [, refresh] = useState(0)
  useEffect(() => setCurrentScreen(requestedScreen), [requestedScreen])
  const currentRole = store?.getCurrentUser()?.role ?? role
  const { screen } = resolveScreen(currentScreen, currentRole)

  const logout = () => {
    store?.logout()
    setCurrentScreen('login')
    refresh((value) => value + 1)
  }

  if (screen === 'login' && store) {
    return (
      <LoginPage
        authenticate={(employeeId, password) => store.authenticate(employeeId, password)}
        onAuthenticated={() => {
          setCurrentScreen('question')
          refresh((value) => value + 1)
        }}
      />
    )
  }
  if (screen === 'question') return <AskPage onLogout={store ? logout : undefined} />
  if (screen === 'forbidden') return <p role="alert">権限がありません</p>

  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f7fb] p-6 text-slate-950">
      <section className="w-full max-w-3xl rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold">{screenHeadings[screen]}</h1>
        {store && (
          <button type="button" onClick={logout} className="mt-8 rounded-lg border border-slate-300 px-4 py-2 font-semibold">
            ログアウト
          </button>
        )}
      </section>
    </main>
  )
}
