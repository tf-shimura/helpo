import { useMemo, useState, type FormEvent } from 'react'
import { AuthenticatedNavigation, type AuthenticatedScreen } from '../components/authenticated-navigation'
import { ControlledAnswer, type AnswerSnapshot } from '../shared/mock/controlled-answer'
import type { Feedback } from '../shared/mock/mock-store'
import { countGraphemes, isBlankInput, truncateGraphemes, validateGraphemeLimit } from '../shared/validation/graphemes'

type AskPageProps = {
  onLogout?: () => void
  onNavigate?: (screen: AuthenticatedScreen) => void
  createAnswer?: (question: string) => ControlledAnswer
  answerId?: string
  createAnswerRecord?: () => string
  rateAnswer?: (answerId: string, feedback: Feedback) => boolean
}

const MAX_QUESTION_LENGTH = 400
const LIMIT_MESSAGE = '質問は400文字以内で入力してください'
const DUMMY_ANSWER = '有給休暇は、原則として取得希望日の3営業日前までに勤怠システムから申請してください。やむを得ない事情がある場合は、事前に上長へ相談してください。'
const DUMMY_SOURCES = ['有給休暇はいつまでに申請すればよいですか？', '急な事情で有給休暇を取得する場合はどうすればよいですか？']

// 実際のAPIは呼ばず、画面確認用の固定データを返します。
const defaultCreateAnswer = () => new ControlledAnswer([DUMMY_ANSWER.slice(0, 34), DUMMY_ANSWER.slice(34)], DUMMY_SOURCES)

export default function AskPage({ onLogout, onNavigate, createAnswer = defaultCreateAnswer, answerId, createAnswerRecord, rateAnswer }: AskPageProps) {
  const [question, setQuestion] = useState('')
  const [controller, setController] = useState<ControlledAnswer | null>(null)
  const [snapshot, setSnapshot] = useState<AnswerSnapshot | null>(null)
  const [currentAnswerId, setCurrentAnswerId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const characterCount = useMemo(() => countGraphemes(question), [question])
  const isGenerating = snapshot?.status === 'pending' || snapshot?.status === 'streaming'
  const canSubmit = !isBlankInput(question) && validateGraphemeLimit(question, MAX_QUESTION_LENGTH) && !isGenerating

  const startAnswer = () => {
    const nextController = createAnswer(question)
    setController(nextController)
    setSnapshot(nextController.snapshot())
    setCurrentAnswerId(createAnswerRecord?.() ?? answerId ?? null)
    setFeedback(null)
    setValidationError(null)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validateGraphemeLimit(question, MAX_QUESTION_LENGTH)) {
      setValidationError(LIMIT_MESSAGE)
      return
    }
    if (!canSubmit) return
    startAnswer()
  }

  const transition = (operation: 'advance' | 'complete' | 'settle' | 'unavailable' | 'fail' | 'abort') => {
    if (!controller || !isGenerating) return
    if (operation === 'advance') controller.advance()
    if (operation === 'complete') controller.complete()
    if (operation === 'settle') controller.settle()
    if (operation === 'unavailable') controller.markUnavailable()
    if (operation === 'fail') controller.fail()
    if (operation === 'abort') controller.abort()
    setSnapshot(controller.snapshot())
  }

  const selectFeedback = (nextFeedback: Feedback) => {
    if (feedback || snapshot?.status !== 'completed') return
    if (rateAnswer && (!currentAnswerId || !rateAnswer(currentAnswerId, nextFeedback))) return
    setFeedback(nextFeedback)
  }

  const uniqueSources = snapshot?.status === 'completed' ? [...new Set(snapshot.sources)] : []

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-base leading-[1.7]">
      <AuthenticatedNavigation current="question" onNavigate={onNavigate} onLogout={onLogout} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <section aria-labelledby="page-title" className="space-y-8">
          <div><h1 id="page-title" className="text-3xl font-bold text-slate-950">社内制度について質問</h1><p className="mt-4 text-slate-600">登録済みのよくある質問をもとに、社内制度に関する疑問へ回答します。</p></div>
          <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <label htmlFor="question" className="block font-bold text-slate-900">質問内容</label>
            <textarea id="question" rows={5} value={question} disabled={isGenerating} onChange={(event) => { setQuestion(truncateGraphemes(event.target.value, MAX_QUESTION_LENGTH)); setValidationError(null) }} aria-describedby={validationError ? 'question-error' : undefined} className="mt-3 w-full rounded-lg border border-slate-300 p-4 disabled:bg-slate-50" />
            <div className="mt-3 flex items-center justify-between gap-6"><p className="text-slate-500">空白や改行だけでは質問できません</p><div className="relative">{characterCount === MAX_QUESTION_LENGTH && <p id="question-limit-tooltip" role="tooltip" className="absolute bottom-full right-0 mb-2 w-max rounded bg-slate-900 px-3 py-2 text-sm text-white">{LIMIT_MESSAGE}</p>}<p aria-describedby={characterCount === MAX_QUESTION_LENGTH ? 'question-limit-tooltip' : undefined} aria-live="polite"><span className="font-semibold">{characterCount}</span> / 400文字</p></div></div>
            {validationError && <p id="question-error" role="alert" className="mt-3 text-red-700">{validationError}</p>}
            <button type="submit" disabled={!canSubmit} className="mt-6 rounded-lg bg-blue-600 px-6 py-3 font-bold text-white disabled:bg-slate-300">{isGenerating ? '回答を生成中' : snapshot?.status === 'failed' ? 'もう一度試す' : '質問する'}</button>
          </form>
          {isGenerating && <div className="rounded-lg border border-slate-200 bg-white p-4" role="group" aria-label="回答生成操作"><div className="flex flex-wrap gap-3"><button type="button" onClick={() => transition('advance')}>次のチャンク</button><button type="button" onClick={() => transition('settle')}>結果へ進む</button><button type="button" onClick={() => transition('complete')}>完了</button><button type="button" onClick={() => transition('unavailable')}>回答不能</button><button type="button" onClick={() => transition('fail')}>失敗</button><button type="button" onClick={() => transition('abort')}>中断</button></div></div>}
          <section aria-labelledby="answer-title" className="min-h-56 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 id="answer-title" className="text-xl font-bold">回答</h2>
            {!snapshot && <p className="mt-6">回答はここに表示されます</p>}
            {isGenerating && <div className="mt-6" role="status" aria-live="polite" aria-busy="true"><p className="font-bold text-blue-700">回答を生成しています</p><p className="mt-3">{snapshot?.text}</p></div>}
            {snapshot?.status === 'unavailable' && <p className="mt-6">登録済みFAQから回答できません。総務へお問い合わせください</p>}
            {snapshot?.status === 'failed' && <p className="mt-6 text-red-800" role="alert">回答を取得できませんでした。もう一度お試しください</p>}
            {snapshot?.status === 'aborted' && <p className="mt-6">回答の生成を中断しました</p>}
            {snapshot?.status === 'completed' && <div className="mt-6 space-y-6"><p>{snapshot.text}</p><div className="border-t border-slate-200 pt-4"><h3 className="font-bold">出典</h3><ul className="mt-3 list-disc pl-6">{uniqueSources.map((source) => <li key={source}>{source}</li>)}</ul></div><div className="border-t border-slate-200 pt-4"><p className="font-bold">この回答は役に立ちましたか？</p><div className="mt-3 flex gap-3"><button type="button" disabled={feedback !== null} onClick={() => selectFeedback('good')} className="rounded-lg border px-4 py-2">Good</button><button type="button" disabled={feedback !== null} onClick={() => selectFeedback('bad')} className="rounded-lg border px-4 py-2">Bad</button></div>{feedback && <div className="mt-3 font-semibold text-blue-700" role="status"><p>{feedback === 'good' ? 'Good' : 'Bad'}を選択済み</p><p>評価を受け付けました</p></div>}</div></div>}
          </section>
        </section>
      </main>
    </div>
  )
}
