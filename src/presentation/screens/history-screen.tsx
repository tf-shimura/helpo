'use client'

import { useEffect, useState } from 'react'
import { AuthenticatedNavigation, type AuthenticatedScreen } from '../../components/authenticated-navigation'
import { HistoryPage } from '../../views/history-page'
import { useSession } from '../session/session-state'
import type { MockHistory } from '../../shared/mock/mock-store'
import type { History } from '../api/api-client'

type HistoryScreenProps = {
  onLogout: () => void
  onNavigate: (screen: AuthenticatedScreen) => void
}

function toMockHistory(history: History): MockHistory {
  if (history.outcome === 'COMPLETE') {
    return {
      id: history.id,
      accountId: '',
      askedAt: new Date(history.askedAt),
      question: history.question,
      answer: history.answer,
      feedback: history.feedback ? (history.feedback.value === 'GOOD' ? 'good' : 'bad') : null,
    }
  }
  return {
    id: history.id,
    accountId: '',
    askedAt: new Date(history.askedAt),
    question: history.question,
    answer: history.message,
    feedback: null,
  }
}

export function HistoryScreen({ onLogout, onNavigate }: HistoryScreenProps) {
  const { apiClient } = useSession()
  const [entries, setEntries] = useState<readonly MockHistory[]>([])

  useEffect(() => {
    let cancelled = false
    apiClient.listHistory().then((result) => {
      if (cancelled) return
      if (result.ok) setEntries(result.value.map(toMockHistory))
    })
    return () => {
      cancelled = true
    }
  }, [apiClient])

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <AuthenticatedNavigation current="history" onNavigate={onNavigate} onLogout={onLogout} />
      <main className="grid place-items-center p-6">
        <HistoryPage entries={entries} />
      </main>
    </div>
  )
}
