import type { Role } from './mock-store'

export type RequestedScreen = 'login' | 'question' | 'history' | 'faq' | 'faq-admin'
export type ResolvedScreen = RequestedScreen | 'forbidden'

export function resolveScreen(requested: RequestedScreen, role: Role | null): { screen: ResolvedScreen } {
  if (!role) return { screen: 'login' }
  if (requested === 'login') return { screen: 'question' }
  if (requested === 'faq-admin' && role !== 'admin') return { screen: 'forbidden' }
  return { screen: requested }
}
