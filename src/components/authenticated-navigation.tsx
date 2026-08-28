export type AuthenticatedScreen = 'question' | 'history' | 'faq'

type AuthenticatedNavigationProps = {
  current: AuthenticatedScreen | null
  onNavigate?: (screen: AuthenticatedScreen) => void
  onLogout?: () => void
}

const ITEMS: readonly { screen: AuthenticatedScreen; label: string }[] = [
  { screen: 'question', label: '質問' },
  { screen: 'history', label: '履歴' },
  { screen: 'faq', label: 'FAQ閲覧' },
]

export function AuthenticatedNavigation({ current, onNavigate, onLogout }: AuthenticatedNavigationProps) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-6 px-6 py-3">
        <p className="text-lg font-bold text-slate-900">社内なんでも質問AI</p>
        <nav aria-label="共通ナビゲーション" className="flex flex-wrap gap-3 lg:ml-auto">
          {ITEMS.map(({ screen, label }) => {
            const isCurrent = current === screen
            return <button key={screen} type="button" aria-current={isCurrent ? 'page' : undefined} onClick={() => onNavigate?.(screen)} className={`rounded-lg px-3 py-2 ${isCurrent ? 'bg-blue-50 font-semibold text-blue-700' : 'font-medium text-slate-600'}`}>{label}</button>
          })}
          <button type="button" onClick={onLogout} disabled={!onLogout} className="rounded-lg px-3 py-2 font-medium disabled:text-slate-400">ログアウト</button>
        </nav>
      </div>
    </header>
  )
}
