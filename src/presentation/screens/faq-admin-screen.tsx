'use client'

import { useEffect, useState } from 'react'
import { AuthenticatedNavigation, type AuthenticatedScreen } from '../../components/authenticated-navigation'
import { FaqAdminPage } from '../../views/faq-admin-page'
import { useSession } from '../session/session-state'
import type { MockFaq } from '../../shared/mock/mock-store'

type FaqAdminScreenProps = {
  faqId?: string
  onLogout: () => void
  onNavigate: (screen: AuthenticatedScreen) => void
  onDone: () => void
}

function toMockFaq(faq: { id: string; question: string; answer: string }): MockFaq {
  return { id: faq.id, question: faq.question, answer: faq.answer }
}

export function FaqAdminScreen({ faqId, onLogout, onNavigate, onDone }: FaqAdminScreenProps) {
  const { apiClient } = useSession()
  const [faq, setFaq] = useState<MockFaq | null>(null)

  useEffect(() => {
    if (!faqId) {
      setFaq(null)
      return
    }
    let cancelled = false
    apiClient.listFaqs().then((result) => {
      if (cancelled) return
      if (!result.ok) return
      const found = result.value.find((f) => f.id === faqId)
      setFaq(found ? toMockFaq(found) : null)
    })
    return () => {
      cancelled = true
    }
  }, [apiClient, faqId])

  const handleCreate = async (question: string, answer: string) => {
    const result = await apiClient.createFaq({ question, answer })
    if (!result.ok) throw new Error(result.message)
    onDone()
  }

  const handleUpdate = async (id: string, question: string, answer: string) => {
    const result = await apiClient.updateFaq(id, { question, answer })
    if (!result.ok) throw new Error(result.message)
    onDone()
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <AuthenticatedNavigation current="faq" onNavigate={onNavigate} onLogout={onLogout} />
      <main className="grid place-items-center p-6">
        <FaqAdminPage key={faqId ?? 'new'} faq={faq} onCreate={handleCreate} onUpdate={handleUpdate} />
      </main>
    </div>
  )
}
