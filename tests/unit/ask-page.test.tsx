import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AskPage from '../../src/views/AskPage'
import { ControlledAnswer } from '../../src/shared/mock/controlled-answer'

afterEach(cleanup)

const submitQuestion = async (question = '休暇について教えてください') => {
  const user = userEvent.setup()
  await user.type(screen.getByRole('textbox', { name: '質問内容' }), question)
  await user.click(screen.getByRole('button', { name: '質問する' }))
  return user
}

describe('AskPage', () => {
  it('空入力を拒否し、Unicode書記素400文字で上限案内を関連付け、401文字目を反映しない', async () => {
    const user = userEvent.setup()
    render(<AskPage />)
    const input = screen.getByRole('textbox', { name: '質問内容' })
    const submit = screen.getByRole('button', { name: '質問する' })

    expect(submit).toBeDisabled()
    await user.type(input, ' \n')
    expect(submit).toBeDisabled()
    await user.clear(input)
    fireEvent.change(input, { target: { value: `${'あ'.repeat(399)}👨‍👩‍👧‍👦い` } })

    expect(input).toHaveValue(`${'あ'.repeat(399)}👨‍👩‍👧‍👦`)
    expect(screen.getByText('400', { selector: 'span' }).parentElement).toHaveAttribute('aria-describedby', 'question-limit-tooltip')
    expect(screen.getByRole('tooltip')).toHaveTextContent('質問は400文字以内で入力してください')
    expect(submit).toBeEnabled()
  })

  it('実際の質問送信から生成中を表示し、再送信を禁止してチャンクと完了を進める', async () => {
    const createAnswer = vi.fn(() => new ControlledAnswer(['最初の回答', 'と続き'], ['使用FAQ', '使用FAQ', '別のFAQ']))
    render(<AskPage createAnswer={createAnswer} />)

    const user = await submitQuestion()
    expect(createAnswer).toHaveBeenCalledWith('休暇について教えてください')
    expect(screen.getByRole('status')).toHaveTextContent('回答を生成しています')
    expect(screen.getByRole('button', { name: '回答を生成中' })).toBeDisabled()
    expect(screen.queryByText('出典')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Good' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '次のチャンク' }))
    expect(screen.getByRole('status')).toHaveTextContent('最初の回答')
    expect(screen.queryByText('出典')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '完了' }))
    expect(screen.getByText('最初の回答と続き')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['使用FAQ', '別のFAQ'])
    expect(screen.getByRole('button', { name: 'Good' })).toBeEnabled()
  })

  it('単一FAQを使用した回答も完了後だけ出典へ表示する', async () => {
    render(<AskPage createAnswer={() => new ControlledAnswer(['回答'], ['唯一のFAQ'])} />)
    const user = await submitQuestion()
    expect(screen.queryByText('出典')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '完了' }))
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['唯一のFAQ'])
  })

  it.each([
    ['回答不能', '登録済みFAQから回答できません。総務へお問い合わせください'],
    ['失敗', '回答を取得できませんでした。もう一度お試しください'],
    ['中断', '回答の生成を中断しました'],
  ])('送信後に%sを決定的に再現し出典と評価を表示しない', async (operation, message) => {
    render(<AskPage createAnswer={() => new ControlledAnswer(['途中', '未表示'], ['未使用FAQ'])} />)
    const user = await submitQuestion()
    await user.click(screen.getByRole('button', { name: '次のチャンク' }))
    await user.click(screen.getByRole('button', { name: operation }))

    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.queryByText('出典')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Good' })).not.toBeInTheDocument()
  })

  it('途中失敗後に同じ質問で新しい回答を再試行する', async () => {
    const createAnswer = vi.fn(() => new ControlledAnswer(['回答'], ['FAQ']))
    render(<AskPage createAnswer={createAnswer} />)
    const user = await submitQuestion()
    await user.click(screen.getByRole('button', { name: '失敗' }))
    await user.click(screen.getByRole('button', { name: 'もう一度試す' }))

    expect(createAnswer).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('status')).toHaveTextContent('回答を生成しています')
  })

  it('完了回答の評価を外部storeへ一度だけ接続し選択後は両操作を無効にする', async () => {
    const rateAnswer = vi.fn(() => true)
    render(<AskPage createAnswer={() => new ControlledAnswer(['回答'], ['FAQ'])} answerId="answer-1" rateAnswer={rateAnswer} />)
    const user = await submitQuestion()
    await user.click(screen.getByRole('button', { name: '完了' }))
    await user.click(screen.getByRole('button', { name: 'Bad' }))

    expect(rateAnswer).toHaveBeenCalledTimes(1)
    expect(rateAnswer).toHaveBeenCalledWith('answer-1', 'bad')
    expect(screen.getByText('評価を受け付けました')).toBeInTheDocument()
    expect(screen.getByText('Badを選択済み')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Good' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Bad' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Good' }))
    expect(rateAnswer).toHaveBeenCalledTimes(1)
  })
})
