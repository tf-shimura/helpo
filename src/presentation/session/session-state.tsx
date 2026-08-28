'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createApiClient, type HelpoApiClient, type Actor, type ApiFailure } from '../api/api-client'

export type LoginOutcome = 'authenticated' | 'invalid' | 'locked'

type SessionContextValue = {
  actor: Actor | null
  loading: boolean
  error: ApiFailure | null
  apiClient: HelpoApiClient
  login: (employeeId: string, password: string) => Promise<LoginOutcome>
  logout: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({
  children,
  apiClient: apiClientProp,
}: Readonly<{ children: ReactNode; apiClient?: HelpoApiClient }>) {
  const defaultApiClient = useMemo(() => createApiClient(), [])
  const apiClient = apiClientProp ?? defaultApiClient

  const [actor, setActor] = useState<Actor | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiFailure | null>(null)

  useEffect(() => {
    let cancelled = false
    apiClient.getSession().then((result) => {
      if (cancelled) return
      if (result.ok) setActor(result.value)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [apiClient])

  const login = useCallback(
    async (employeeId: string, password: string): Promise<LoginOutcome> => {
      setError(null)
      const result = await apiClient.login({ employeeId, password })
      if (result.ok) {
        setActor(result.value)
        return 'authenticated'
      }
      if (result.code === 'INVALID_CREDENTIALS') return 'invalid'
      if (result.code === 'LOGIN_LOCKED') return 'locked'
      setError(result)
      return 'invalid'
    },
    [apiClient],
  )

  const logout = useCallback(async () => {
    await apiClient.logout()
    setActor(null)
  }, [apiClient])

  const value = useMemo(
    () => ({ actor, loading, error, apiClient, login, logout }),
    [actor, loading, error, apiClient, login, logout],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
