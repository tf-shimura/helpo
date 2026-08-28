import type { MockFaq, Role } from '../shared/mock/mock-store'

type FaqPageProps = {
  faqs: readonly MockFaq[]
  role: Role
  onCreate: () => void
  onEdit: (id: string) => void
}

export function FaqPage({ faqs, role, onCreate, onEdit }: FaqPageProps) {
  const canManage = role === 'admin'
  return (
    <section className="w-full max-w-3xl rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">FAQ閲覧</h1>
        {canManage && <div className="flex gap-2">
          <button type="button" onClick={onCreate} className="rounded-lg border border-blue-600 px-4 py-2 font-semibold text-blue-700">FAQ管理</button>
          <button type="button" onClick={onCreate} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">新規登録</button>
        </div>}
      </div>
      {faqs.length === 0 ? (
        <p className="mt-6 text-slate-600">登録済みFAQはありません</p>
      ) : (
        <div className="mt-6 space-y-4">
          {faqs.map((faq) => (
            <article key={faq.id} className="rounded-lg border border-slate-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <h2 className="font-semibold">{faq.question}</h2>
                {canManage && <button type="button" onClick={() => onEdit(faq.id)} className="rounded-lg border border-blue-600 px-3 py-1 font-medium text-blue-700">編集</button>}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-slate-700">{faq.answer}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
