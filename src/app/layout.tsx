import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '../index.css'

export const metadata: Metadata = {
  title: 'Helpo',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
