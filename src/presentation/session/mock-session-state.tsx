'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { MockAccount } from '../../shared/mock/mock-store'
import type { MockApiClient } from '../api/mock-api-client'

type MockSessionState = Readonly<{ actor: MockAccount | null; status: 'unknown' | 'authenticated' | 'unauthenticated'; signIn: (id: string, password: string) => Promise<boolean>; signOut: () => Promise<void> }>
const SessionContext = createContext<MockSessionState | null>(null)

export function MockSessionProvider({ client, children }: { client: MockApiClient; children: ReactNode }) {
  const [actor, setActor] = useState<MockAccount | null>(null)
  const [status, setStatus] = useState<MockSessionState['status']>('unknown')
  useEffect(() => { void client.getSession().then((result) => { if (result.ok) { setActor(result.value); setStatus('authenticated') } else { setActor(null); setStatus('unauthenticated') } }) }, [client])
  const value = useMemo<MockSessionState>(() => ({
    actor,
    status,
    async signIn(id, password) { const result = await client.login(id, password); if (!result.ok) return false; setActor(result.value); setStatus('authenticated'); return true },
    async signOut() { await client.logout(); setActor(null); setStatus('unauthenticated') },
  }), [actor, client, status])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useMockSession(): MockSessionState {
  const value = useContext(SessionContext)
  if (!value) throw new Error('MockSessionProviderが必要です')
  return value
}
