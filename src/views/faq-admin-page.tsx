import { useState } from 'react'
import type { MockFaq } from '../shared/mock/mock-store'
import { isBlankInput, truncateGraphemes } from '../shared/validation/graphemes'

type FaqAdminPageProps = Readonly<{
  faq: MockFaq | null
  onCreate: (question: string, answer: string) => void | Promise<void>
  onUpdate: (id: string, question: string, answer: string) => void | Promise<void>
}>

const LIMIT = 1000

export function FaqAdminPage({ faq, onCreate, onUpdate }: FaqAdminPageProps) {
  const [question, setQuestion] = useState(faq?.question ?? '')
  const [answer, setAnswer] = useState(faq?.answer ?? '')
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const isEditing = faq !== null
  const canSubmit = !isBlankInput(question) && !isBlankInput(answer)

  const submit = async () => {
    setMessage(null)
    try {
      if (faq) await onUpdate(faq.id, question, answer)
      else await onCreate(question, answer)
      setMessage({ kind: 'success', text: faq ? 'FAQを修正しました' : 'FAQを登録しました' })
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'FAQを保存できませんでした' })
    }
  }

  return (
    <section className="w-full max-w-3xl rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-3xl font-bold">{isEditing ? 'FAQ編集' : 'FAQ新規登録'}</h1>
      <div className="mt-6 space-y-5">
        <label className="block font-semibold">FAQ質問
          <textarea value={question} onChange={(event) => setQuestion(truncateGraphemes(event.target.value, LIMIT))} className="mt-2 min-h-32 w-full rounded-lg border border-slate-300 p-3 font-normal" />
        </label>
        <label className="block font-semibold">FAQ回答
          <textarea value={answer} onChange={(event) => setAnswer(truncateGraphemes(event.target.value, LIMIT))} className="mt-2 min-h-40 w-full rounded-lg border border-slate-300 p-3 font-normal" />
        </label>
        {message && <p role={message.kind === 'success' ? 'status' : 'alert'} className={message.kind === 'success' ? 'text-green-700' : 'text-red-700'}>{message.text}</p>}
        <button type="button" disabled={!canSubmit} onClick={submit} className="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white disabled:bg-slate-300">{isEditing ? '保存' : '登録'}</button>
      </div>
    </section>
  )
}
