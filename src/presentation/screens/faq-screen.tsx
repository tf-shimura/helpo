'use client'

import { useEffect, useState } from 'react'
import { AuthenticatedNavigation, type AuthenticatedScreen } from '../../components/authenticated-navigation'
import { FaqPage } from '../../views/faq-page'
import { useSession } from '../session/session-state'
import type { MockFaq, Role } from '../../shared/mock/mock-store'
import type { Faq } from '../api/api-client'

type FaqScreenProps = {
  onLogout: () => void
  onNavigate: (screen: AuthenticatedScreen) => void
  onCreate: () => void
  onEdit: (id: string) => void
}

function toMockFaq(faq: Faq): MockFaq {
  return { id: faq.id, question: faq.question, answer: faq.answer }
}

export function FaqScreen({ onLogout, onNavigate, onCreate, onEdit }: FaqScreenProps) {
  const { apiClient, actor } = useSession()
  const [faqs, setFaqs] = useState<readonly MockFaq[]>([])

  useEffect(() => {
    let cancelled = false
    apiClient.listFaqs().then((result) => {
      if (cancelled) return
      if (result.ok) setFaqs(result.value.map(toMockFaq))
    })
    return () => {
      cancelled = true
    }
  }, [apiClient])

  const role: Role = actor?.role === 'ADMIN' ? 'admin' : 'employee'

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <AuthenticatedNavigation current="faq" onNavigate={onNavigate} onLogout={onLogout} />
      <main className="grid place-items-center p-6">
        <FaqPage faqs={faqs} role={role} onCreate={onCreate} onEdit={onEdit} />
      </main>
    </div>
  )
}
