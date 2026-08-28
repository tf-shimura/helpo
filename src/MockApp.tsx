import AskPage from './pages/AskPage'
import type { Role } from './shared/mock/mock-store'
import { resolveScreen, type RequestedScreen } from './shared/mock/screen-access'

type MockAppProps = {
  requestedScreen: RequestedScreen
  role: Role | null
}

const screenHeadings = {
  login: 'ログイン',
  history: '質問履歴',
  faq: 'FAQ閲覧',
  'faq-admin': 'FAQ管理',
} as const

export function MockApp({ requestedScreen, role }: MockAppProps) {
  const { screen } = resolveScreen(requestedScreen, role)

  if (screen === 'question') return <AskPage />
  if (screen === 'forbidden') return <p role="alert">権限がありません</p>

  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f7fb] p-6 text-slate-950">
      <section className="w-full max-w-3xl rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold">{screenHeadings[screen]}</h1>
      </section>
    </main>
  )
}
