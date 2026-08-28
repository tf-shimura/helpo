'use client'

import { useRef, useState } from 'react'
import { AuthenticatedNavigation, type AuthenticatedScreen } from '../../components/authenticated-navigation'
import { useSession } from '../session/session-state'
import {
  beginAnswer,
  initialAnswerState,
  reduceAnswerEvent,
  abortAnswer,
  failAnswer,
  type MockAnswerState,
} from '../stream/answer-state'
import { countGraphemes, isBlankInput, truncateGraphemes, validateGraphemeLimit } from '../../shared/validation/graphemes'

const MAX_QUESTION_LENGTH = 400
const LIMIT_MESSAGE = '質問は400文字以内で入力してください'

type AskScreenProps = Readonly<{
  onLogout: () => void
  onNavigate: (screen: AuthenticatedScreen) => void
}>

export function AskScreen({ onLogout, onNavigate }: AskScreenProps) {
  const { apiClient } = useSession()
  const [question, setQuestion] = useState('')
  const [answerState, setAnswerState] = useState<MockAnswerState>(initialAnswerState)
  const [feedback, setFeedback] = useState<'good' | 'bad' | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const abortController = useRef<AbortController | null>(null)

  const isGenerating = answerState.status === 'awaiting-start' || answerState.status === 'streaming'
  const canSubmit = !isBlankInput(question) && validateGraphemeLimit(question, MAX_QUESTION_LENGTH) && !isGenerating

  const cancelInFlight = () => {
    abortController.current?.abort()
    abortController.current = null
  }

  const submit = async () => {
    if (!validateGraphemeLimit(question, MAX_QUESTION_LENGTH)) {
      setValidationError(LIMIT_MESSAGE)
      return
    }
    if (!canSubmit) return
    setValidationError(null)
    setFeedback(null)
    cancelInFlight()
    setAnswerState(beginAnswer())
    const controller = new AbortController()
    abortController.current = controller
    const result = await apiClient.streamAnswer(question, controller.signal)
    if (!result.ok) {
      abortController.current = null
      setAnswerState((state) => failAnswer(state, result.message, false))
      return
    }

    let terminalReached = false
    try {
      for await (const event of result.value) {
        setAnswerState((state) => {
          const next = reduceAnswerEvent(state, event)
          if (next.status === 'completed' || next.status === 'unanswerable' || next.status === 'failed') {
            terminalReached = true
          }
          return next
        })
      }
    } catch (error) {
      const aborted = controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')
      setAnswerState((state) =>
        aborted
          ? abortAnswer(state)
          : failAnswer(state, '回答を取得できませんでした。もう一度お試しください', false),
      )
      return
    } finally {
      abortController.current = null
    }

    if (!terminalReached) {
      setAnswerState((state) => failAnswer(state, '回答を取得できませんでした。もう一度お試しください', false))
    }
  }

  const abort = () => {
    cancelInFlight()
  }

  const submitFeedback = async (value: 'good' | 'bad') => {
    if (feedback || answerState.status !== 'completed' || !answerState.answerId) return
    const result = await apiClient.submitFeedback(answerState.answerId, value === 'good' ? 'GOOD' : 'BAD')
    if (result.ok) setFeedback(value)
  }

  const characterCount = countGraphemes(question)
  const uniqueSources = answerState.status === 'completed' ? [...new Set(answerState.sources)] : []

  let submitLabel = '質問する'
  if (isGenerating) submitLabel = '回答を生成中'
  else if (answerState.status === 'failed') submitLabel = 'もう一度試す'

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-base leading-[1.7]">
      <AuthenticatedNavigation current="question" onNavigate={onNavigate} onLogout={onLogout} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <section aria-labelledby="page-title" className="space-y-8">
          <div>
            <h1 id="page-title" className="text-3xl font-bold text-slate-950">
              社内制度について質問
            </h1>
            <p className="mt-4 text-slate-600">
              登録済みのよくある質問をもとに、社内制度に関する疑問へ回答します。
            </p>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
          >
            <label htmlFor="question" className="block font-bold text-slate-900">
              質問内容
            </label>
            <textarea
              id="question"
              rows={5}
              value={question}
              disabled={isGenerating}
              onChange={(event) => {
                setQuestion(truncateGraphemes(event.target.value, MAX_QUESTION_LENGTH))
                setValidationError(null)
              }}
              aria-describedby={validationError ? 'question-error' : undefined}
              className="mt-3 w-full rounded-lg border border-slate-300 p-4 disabled:bg-slate-50"
            />
            <div className="mt-3 flex items-center justify-between gap-6">
              <p className="text-slate-500">空白や改行だけでは質問できません</p>
              <div className="relative">
                {characterCount === MAX_QUESTION_LENGTH && (
                  <p
                    id="question-limit-tooltip"
                    role="tooltip"
                    className="absolute bottom-full right-0 mb-2 w-max rounded bg-slate-900 px-3 py-2 text-sm text-white"
                  >
                    {LIMIT_MESSAGE}
                  </p>
                )}
                <p
                  aria-describedby={characterCount === MAX_QUESTION_LENGTH ? 'question-limit-tooltip' : undefined}
                  aria-live="polite"
                >
                  <span className="font-semibold">{characterCount}</span> / 400文字
                </p>
              </div>
            </div>
            {validationError && (
              <p id="question-error" role="alert" className="mt-3 text-red-700">
                {validationError}
              </p>
            )}
            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-6 rounded-lg bg-blue-600 px-6 py-3 font-bold text-white disabled:bg-slate-300"
            >
              {submitLabel}
            </button>
            {isGenerating && (
              <button
                type="button"
                onClick={abort}
                className="ml-3 rounded-lg border border-slate-300 px-4 py-2"
              >
                中断
              </button>
            )}
          </form>
          <section
            aria-labelledby="answer-title"
            className="min-h-56 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h2 id="answer-title" className="text-xl font-bold">
              回答
            </h2>
            {answerState.status === 'idle' && <p className="mt-6">回答はここに表示されます</p>}
            {isGenerating && (
              <div className="mt-6" role="status" aria-live="polite" aria-busy="true">
                <p className="font-bold text-blue-700">回答を生成しています</p>
                <p className="mt-3">{answerState.text}</p>
              </div>
            )}
            {answerState.status === 'unanswerable' && (
              <p className="mt-6">登録済みFAQから回答できません。総務へお問い合わせください</p>
            )}
            {answerState.status === 'failed' && (
              <p className="mt-6 text-red-800" role="alert">
                回答を取得できませんでした。もう一度お試しください
              </p>
            )}
            {answerState.status === 'aborted' && <p className="mt-6">回答の生成を中断しました</p>}
            {answerState.status === 'completed' && (
              <div className="mt-6 space-y-6">
                <p>{answerState.text}</p>
                <div className="border-t border-slate-200 pt-4">
                  <h3 className="font-bold">出典</h3>
                  <ul className="mt-3 list-disc pl-6">
                    {uniqueSources.map((source) => (
                      <li key={source}>{source}</li>
                    ))}
                  </ul>
                </div>
                <div className="border-t border-slate-200 pt-4">
                  <p className="font-bold">この回答は役に立ちましたか？</p>
                  <div className="mt-3 flex gap-3">
                    <button
                      type="button"
                      disabled={feedback !== null}
                      onClick={() => submitFeedback('good')}
                      className="rounded-lg border px-4 py-2"
                    >
                      Good
                    </button>
                    <button
                      type="button"
                      disabled={feedback !== null}
                      onClick={() => submitFeedback('bad')}
                      className="rounded-lg border px-4 py-2"
                    >
                      Bad
                    </button>
                  </div>
                  {feedback && (
                    <output className="mt-3 block font-semibold text-blue-700">
                      <p>{feedback === 'good' ? 'Good' : 'Bad'}を選択済み</p>
                      <p>評価を受け付けました</p>
                    </output>
                  )}
                </div>
              </div>
            )}
          </section>
        </section>
      </main>
    </div>
  )
}
