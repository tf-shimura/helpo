import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

type ViewState = 'empty' | 'loading' | 'success' | 'error'
type Feedback = 'good' | 'bad' | null

type MockAnswer = {
  answer: string
  sources: string[]
}

const SAMPLE_QUESTION = '有給休暇はいつまでに申請すればよいですか？'
const MAX_QUESTION_LENGTH = 400

const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' })

function splitGraphemes(value: string) {
  return Array.from(segmenter.segment(value), ({ segment }) => segment)
}

const DUMMY_ANSWER: MockAnswer = {
  answer:
    '有給休暇は、原則として取得希望日の3営業日前までに勤怠システムから申請してください。やむを得ない事情がある場合は、事前に上長へ相談してください。',
  sources: [
    '有給休暇はいつまでに申請すればよいですか？',
    '急な事情で有給休暇を取得する場合はどうすればよいですか？',
  ],
}

// 実際のAPIは呼ばず、画面確認用の固定データを返します。
async function getDummyAnswer(
  onChunk: (answer: string) => void,
  signal: AbortSignal,
): Promise<MockAnswer> {
  const graphemes = splitGraphemes(DUMMY_ANSWER.answer)
  const chunkSizes = [3, 4, 2, 5]
  let end = 0
  let chunkIndex = 0

  while (end < graphemes.length) {
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        window.clearTimeout(timeoutId)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      const timeoutId = window.setTimeout(() => {
        signal.removeEventListener('abort', abort)
        resolve()
      }, 140)

      if (signal.aborted) {
        abort()
      } else {
        signal.addEventListener('abort', abort, { once: true })
      }
    })
    signal.throwIfAborted()

    end = Math.min(end + chunkSizes[chunkIndex % chunkSizes.length], graphemes.length)
    chunkIndex += 1
    onChunk(graphemes.slice(0, end).join(''))
  }

  return DUMMY_ANSWER
}

const stateOptions: { value: ViewState; label: string }[] = [
  { value: 'empty', label: '空っぽ' },
  { value: 'loading', label: '読み込み中' },
  { value: 'success', label: '成功' },
  { value: 'error', label: 'エラー' },
]

function SendIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2">
      <path d="m4 4 17 8-17 8 3-8-3-8Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 12h14" strokeLinecap="round" />
    </svg>
  )
}

export default function AskPage() {
  const [viewState, setViewState] = useState<ViewState>('empty')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<MockAnswer | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const activeRequest = useRef<AbortController | null>(null)

  const characterCount = useMemo(() => splitGraphemes(question).length, [question])
  const canSubmit = question.trim().length > 0 && viewState !== 'loading'

  useEffect(() => () => {
    activeRequest.current?.abort()
    activeRequest.current = null
  }, [])

  const startStreaming = async () => {
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    setViewState('loading')
    setAnswer({ answer: '', sources: [] })
    setFeedback(null)

    try {
      const result = await getDummyAnswer(
        (streamedAnswer) => {
          if (controller.signal.aborted || activeRequest.current !== controller) return
          setAnswer({ answer: streamedAnswer, sources: [] })
        },
        controller.signal,
      )
      if (controller.signal.aborted || activeRequest.current !== controller) return

      setAnswer(result)
      setViewState('success')
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
      if (activeRequest.current !== controller) return
      setAnswer(null)
      setViewState('error')
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null
    }
  }

  const changeState = (nextState: ViewState) => {
    activeRequest.current?.abort()
    activeRequest.current = null
    setViewState(nextState)
    setFeedback(null)

    if (nextState === 'empty') {
      setQuestion('')
      setAnswer(null)
      return
    }

    setQuestion(SAMPLE_QUESTION)
    if (nextState === 'loading') {
      void startStreaming()
    } else if (nextState === 'success') {
      setAnswer(DUMMY_ANSWER)
    } else {
      setAnswer(null)
    }
  }

  const handleQuestionChange = (value: string) => {
    setQuestion(splitGraphemes(value).slice(0, MAX_QUESTION_LENGTH).join(''))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    void startStreaming()
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-base leading-[1.7]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-6 px-6 py-3">
          <div className="order-1 flex min-w-0 items-center gap-6">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-600 text-base leading-[1.7] font-bold text-white">問</div>
            <p className="truncate text-lg leading-[1.7] font-bold tracking-tight text-slate-900">社内なんでも質問AI</p>
          </div>

          <nav aria-label="共通ナビゲーション" className="order-3 flex basis-full flex-wrap items-center gap-6 text-base leading-[1.7] lg:order-2 lg:ml-auto lg:basis-auto">
            <button
              type="button"
              aria-current="page"
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 font-semibold text-blue-700"
            >
              質問
            </button>
            <button
              type="button"
              aria-disabled="true"
              title="履歴画面は準備中です"
              className="rounded-lg px-3 py-2 font-medium text-slate-600"
            >
              履歴
            </button>
            <button
              type="button"
              aria-disabled="true"
              title="FAQ閲覧画面は準備中です"
              className="rounded-lg px-3 py-2 font-medium text-slate-600"
            >
              FAQ閲覧
            </button>
          </nav>

          <div className="order-2 ml-auto flex items-center gap-6 text-base leading-[1.7] text-slate-600 lg:order-3 lg:ml-0">
            <span className="hidden sm:inline">山田 太郎さん</span>
            <button
              type="button"
              aria-disabled="true"
              title="ログアウト機能は準備中です"
              className="rounded-lg px-3 py-2 font-medium"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <section aria-labelledby="page-title" className="space-y-8">
          <div>
            <p className="mb-6 text-base leading-[1.7] font-semibold text-blue-700">質問する</p>
            <h1 id="page-title" className="text-3xl leading-[1.7] font-bold tracking-tight text-slate-950">社内制度について質問</h1>
            <p className="mt-6 text-base leading-[1.7] text-slate-600">
              登録済みのよくある質問をもとに、社内制度に関する疑問へ回答します。
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-6">
              <span className="text-base leading-[1.7] font-semibold text-slate-700">表示状態を切り替える</span>
              <div className="flex flex-wrap gap-6" role="group" aria-label="表示状態">
                {stateOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={viewState === option.value}
                    onClick={() => changeState(option.value)}
                    className={`rounded-lg border px-6 py-6 text-base leading-[1.7] font-semibold transition ${
                      viewState === option.value
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="space-y-6">
              <label htmlFor="question" className="block text-base leading-[1.7] font-bold text-slate-900">質問内容</label>
              <textarea
                id="question"
                rows={5}
                value={question}
                disabled={viewState === 'loading'}
                onChange={(event) => handleQuestionChange(event.target.value)}
                placeholder="例：有給休暇はいつまでに申請すればよいですか？"
                className="w-full resize-y rounded-lg border border-slate-300 px-6 py-6 text-base leading-[1.7] text-slate-900 placeholder:text-slate-400 disabled:bg-slate-50"
              />
              <div className="flex items-center justify-between gap-6">
                <p className="text-base leading-[1.7] text-slate-500">空白や改行だけでは質問できません</p>
                <div className="relative shrink-0">
                  {characterCount === MAX_QUESTION_LENGTH && (
                    <p
                      id="question-limit-tooltip"
                      role="tooltip"
                      className="absolute bottom-full right-0 mb-3 w-max max-w-72 rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-lg after:absolute after:right-6 after:top-full after:border-8 after:border-transparent after:border-t-slate-900"
                    >
                      質問は400文字以内で入力してください
                    </p>
                  )}
                  <p
                    className="text-base leading-[1.7] tabular-nums text-slate-600"
                    aria-describedby={characterCount === MAX_QUESTION_LENGTH ? 'question-limit-tooltip' : undefined}
                    aria-live="polite"
                  >
                    <span className="font-semibold text-slate-900">{characterCount}</span> / 400文字
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex min-h-12 min-w-40 items-center justify-center gap-6 rounded-lg bg-blue-600 px-6 py-6 text-base leading-[1.7] font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <SendIcon />
                {viewState === 'loading' ? '回答を生成中' : viewState === 'error' ? 'もう一度試す' : '質問する'}
              </button>
            </div>
          </form>

          <section aria-labelledby="answer-title" className="min-h-56 rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 id="answer-title" className="text-xl leading-[1.7] font-bold text-slate-950">回答</h2>

            {viewState === 'empty' && (
              <div className="grid min-h-36 place-items-center text-center">
                <div>
                  <p className="text-base leading-[1.7] font-semibold text-slate-700">回答はここに表示されます</p>
                  <p className="mt-6 text-base leading-[1.7] text-slate-500">上の入力欄に質問を入力してください。</p>
                </div>
              </div>
            )}

            {viewState === 'loading' && (
              <div className="mt-6" role="status" aria-live="polite" aria-atomic="false" aria-busy="true">
                <div className="flex items-center gap-6 text-blue-700">
                  <span className="h-3 w-3 animate-pulse rounded-full bg-blue-600" aria-hidden="true" />
                  <p className="font-bold">回答を生成しています</p>
                </div>
                <p className="mt-6 text-base leading-[1.7] text-slate-700">
                  {answer?.answer}
                  <span className="ml-6 inline-block h-5 w-1 animate-pulse bg-blue-600 align-middle" aria-hidden="true" />
                </p>
              </div>
            )}

            {viewState === 'error' && (
              <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-6" role="alert">
                <p className="font-bold text-red-800">回答を取得できませんでした。もう一度お試しください</p>
                <p className="mt-6 text-base leading-[1.7] text-red-700">入力内容を確認して、もう一度お試しください。</p>
              </div>
            )}

            {viewState === 'success' && answer && (
              <div className="mt-6 space-y-8">
                <p className="text-base leading-[1.7] text-slate-800">{answer.answer}</p>

                <div className="border-t border-slate-200 pt-6">
                  <h3 className="text-base leading-[1.7] font-bold text-slate-900">出典</h3>
                  <ul className="mt-6 space-y-6">
                    {answer.sources.map((source) => (
                      <li key={source} className="flex gap-6 text-base leading-[1.7] text-slate-700">
                        <span className="mt-6 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />
                        {source}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="border-t border-slate-200 pt-6">
                  <p className="font-bold text-slate-900">この回答は役に立ちましたか？</p>
                  <div className="mt-6 flex flex-wrap gap-6">
                    <button
                      type="button"
                      disabled={feedback !== null}
                      onClick={() => setFeedback('good')}
                      className={`rounded-lg border px-6 py-6 font-semibold disabled:cursor-not-allowed ${feedback === 'good' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50'}`}
                    >
                      良かった
                    </button>
                    <button
                      type="button"
                      disabled={feedback !== null}
                      onClick={() => setFeedback('bad')}
                      className={`rounded-lg border px-6 py-6 font-semibold disabled:cursor-not-allowed ${feedback === 'bad' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50'}`}
                    >
                      改善が必要
                    </button>
                  </div>
                  {feedback && (
                    <p className="mt-6 text-base leading-[1.7] font-semibold text-blue-700" role="status">評価を受け付けました</p>
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
