import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '../index.css'
import { SessionProvider } from '../presentation/session/session-state'

export const metadata: Metadata = {
  title: 'Helpo',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
