'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LoginPage } from '../../views/LoginPage'
import { AskScreen } from '../../presentation/screens/ask-screen'
import { HistoryScreen } from '../../presentation/screens/history-screen'
import { FaqScreen } from '../../presentation/screens/faq-screen'
import { FaqAdminScreen } from '../../presentation/screens/faq-admin-screen'
import { useSession } from '../../presentation/session/session-state'
import type { AuthenticatedScreen } from '../authenticated-navigation'

export type Screen = 'login' | 'question' | 'history' | 'faq' | 'faq-admin'

type HelpoClientProps = {
  initialScreen: Screen
  faqId?: string
}

export function HelpoClient({ initialScreen, faqId }: HelpoClientProps) {
  const session = useSession()
  const router = useRouter()

  useEffect(() => {
    if (session.loading) return
    if (!session.actor && initialScreen !== 'login') {
      router.replace('/')
    }
    if (session.actor && initialScreen === 'login') {
      router.replace('/ask')
    }
  }, [session, initialScreen, router])

  if (session.loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f7fb] text-slate-950">
        読み込み中...
      </main>
    )
  }

  if (initialScreen === 'login') {
    if (session.actor) return null
    return (
      <LoginPage
        authenticate={async (employeeId, password) => ({ status: await session.login(employeeId, password) })}
        onAuthenticated={() => router.push('/ask')}
      />
    )
  }

  if (!session.actor) return null

  const navigate = (screen: AuthenticatedScreen) => {
    if (screen === 'question') router.push('/ask')
    if (screen === 'history') router.push('/history')
    if (screen === 'faq') router.push('/faqs')
  }

  const logout = async () => {
    await session.logout()
    router.push('/')
  }

  if (initialScreen === 'question') {
    return <AskScreen onLogout={logout} onNavigate={navigate} />
  }

  if (initialScreen === 'history') {
    return <HistoryScreen onLogout={logout} onNavigate={navigate} />
  }

  if (initialScreen === 'faq') {
    return (
      <FaqScreen
        onLogout={logout}
        onNavigate={navigate}
        onCreate={() => router.push('/admin/faqs')}
        onEdit={(id) => router.push(`/admin/faqs/${id}`)}
      />
    )
  }

  if (initialScreen === 'faq-admin') {
    if (session.actor.role !== 'ADMIN') {
      return (
        <main className="grid min-h-screen place-items-center bg-[#f5f7fb] text-slate-950">
          <p role="alert">権限がありません</p>
        </main>
      )
    }
    return <FaqAdminScreen faqId={faqId} onLogout={logout} onNavigate={navigate} onDone={() => router.push('/faqs')} />
  }

  return null
}
