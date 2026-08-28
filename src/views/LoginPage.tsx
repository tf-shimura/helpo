import { useState, type FormEvent } from 'react'

type LoginResult = { status: 'authenticated' | 'invalid' | 'locked' }

type LoginPageProps = Readonly<{
  authenticate: (employeeId: string, password: string) => LoginResult | Promise<LoginResult>
  onAuthenticated: () => void
}>

export function LoginPage({ authenticate, onAuthenticated }: LoginPageProps) {
  const [employeeId, setEmployeeId] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    const result = await authenticate(employeeId, password)
    if (result.status === 'authenticated') {
      setMessage(null)
      onAuthenticated()
    } else if (result.status === 'locked') {
      setMessage(message?.includes('5回失敗') ? 'ロック中です' : 'ログインに5回失敗したため、10分間ロックされました')
    } else {
      setMessage('社員IDまたはパスワードが正しくありません')
    }
    setIsSubmitting(false)
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f7fb] p-6 text-slate-950">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-blue-600 font-bold text-white">問</div>
          <h1 className="mt-4 text-3xl font-bold">ログイン</h1>
          <p className="mt-3 text-slate-600">社内なんでも質問AI</p>
        </div>
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block font-semibold" htmlFor="employee-id">社員ID</label>
            <input
              id="employee-id"
              autoComplete="username"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
            />
          </div>
          <div>
            <label className="mb-2 block font-semibold" htmlFor="password">パスワード</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
            />
          </div>
          {message && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{message}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-blue-600 px-6 py-3 font-bold text-white disabled:bg-slate-300"
          >
            {isSubmitting ? 'ログイン中' : 'ログイン'}
          </button>
        </form>
      </section>
    </main>
  )
}
