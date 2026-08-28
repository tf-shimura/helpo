import type { MockHistory } from '../shared/mock/mock-store'

type HistoryPageProps = {
  entries: readonly MockHistory[]
}

const formatter = new Intl.DateTimeFormat('ja-JP', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function HistoryPage({ entries }: HistoryPageProps) {
  return (
    <section className="w-full max-w-3xl rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-3xl font-bold">質問履歴</h1>
      {entries.length === 0 ? (
        <p className="mt-6 text-slate-600">質問履歴はありません</p>
      ) : (
        <div className="mt-6 space-y-4">
          {entries.map((entry) => (
            <article key={entry.id} className="rounded-lg border border-slate-200 p-5">
              <time dateTime={entry.askedAt.toISOString()} className="text-sm text-slate-500">{formatter.format(entry.askedAt)}</time>
              <h2 className="mt-2 font-semibold">{entry.question}</h2>
              <p className="mt-3 whitespace-pre-wrap text-slate-700">{entry.answer}</p>
              {entry.feedback && <p className="mt-3 text-sm font-medium">評価: {entry.feedback === 'good' ? 'Good' : 'Bad'}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
