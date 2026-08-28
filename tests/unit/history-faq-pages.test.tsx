import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { MockApp } from '../../src/MockApp'
import { ManualClock } from '../../src/shared/mock/manual-clock'
import { createMockStore, type MockFaq, type MockHistory } from '../../src/shared/mock/mock-store'

afterEach(cleanup)

const NOW = new Date('2026-08-28T12:00:00Z')

function authenticatedStore(role: 'employee' | 'admin', options: { faqs?: readonly MockFaq[]; histories?: readonly MockHistory[] } = {}) {
  const store = createMockStore(new ManualClock(NOW), options)
  store.authenticate(role === 'admin' ? 'A001' : 'E001', role === 'admin' ? 'admin-pass' : 'employee-pass')
  return store
}

describe('本人の質問履歴画面', () => {
  it.each([
    ['employee', 'E001', 'employee-pass', 'employee-1', 'admin-1'],
    ['admin', 'A001', 'admin-pass', 'admin-1', 'employee-1'],
  ] as const)('%sには本人の履歴だけを新しい順で表示する', (_role, employeeId, password, ownerId, otherId) => {
    const histories: MockHistory[] = [
      { id: 'old', accountId: ownerId, askedAt: new Date('2026-08-27T01:00:00Z'), question: '古い質問', answer: '古い回答', feedback: 'good' },
      { id: 'other', accountId: otherId, askedAt: new Date('2026-08-28T11:00:00Z'), question: '他社員の秘密質問', answer: '他社員の秘密回答', feedback: 'bad' },
      { id: 'new', accountId: ownerId, askedAt: new Date('2026-08-28T10:00:00Z'), question: '新しい質問', answer: '登録済みFAQから回答できません。総務へお問い合わせください', feedback: 'bad' },
    ]
    const store = createMockStore(new ManualClock(NOW), { histories })
    store.authenticate(employeeId, password)
    render(createElement(MockApp, { requestedScreen: 'history', store }))

    const entries = screen.getAllByRole('article')
    expect(entries).toHaveLength(2)
    expect(entries[0]).toHaveTextContent('新しい質問')
    expect(entries[0]).toHaveTextContent('2026')
    expect(entries[0]).toHaveTextContent('Bad')
    expect(entries[1]).toHaveTextContent('古い質問')
    expect(entries[1]).toHaveTextContent('古い回答')
    expect(entries[1]).toHaveTextContent('Good')
    expect(screen.queryByText('他社員の秘密質問')).not.toBeInTheDocument()
  })

  it('本人の履歴がない場合は空状態を表示する', () => {
    render(createElement(MockApp, { requestedScreen: 'history', store: authenticatedStore('employee') }))
    expect(screen.getByText('質問履歴はありません')).toBeInTheDocument()
  })
})

describe('FAQ閲覧画面', () => {
  const faqs = [
    { id: 'faq-a', question: '質問A', answer: '回答A' },
    { id: 'faq-b', question: '質問B', answer: '回答B' },
  ]

  it('FAQ一覧を表示し一般社員には管理操作も削除操作も表示しない', () => {
    render(createElement(MockApp, { requestedScreen: 'faq', store: authenticatedStore('employee', { faqs }) }))
    expect(screen.getByText('質問A')).toBeInTheDocument()
    expect(screen.getByText('回答B')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '新規登録' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /削除/ })).not.toBeInTheDocument()
  })

  it('FAQがない場合は空状態を表示する', () => {
    render(createElement(MockApp, { requestedScreen: 'faq', store: authenticatedStore('employee', { faqs: [] }) }))
    expect(screen.getByText('登録済みFAQはありません')).toBeInTheDocument()
  })

  it('管理者は新規登録と指定FAQの編集モードへ遷移できる', async () => {
    const user = userEvent.setup()
    const store = authenticatedStore('admin', { faqs })
    const { unmount } = render(createElement(MockApp, { requestedScreen: 'faq', store }))
    expect(screen.getAllByRole('button', { name: '編集' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /削除/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '新規登録' }))
    expect(screen.getByRole('heading', { name: 'FAQ新規登録' })).toBeInTheDocument()
    expect(screen.getByLabelText('FAQ質問')).toHaveValue('')
    expect(screen.getByLabelText('FAQ回答')).toHaveValue('')
    expect(screen.getByRole('button', { name: '登録' })).toBeDisabled()

    unmount()
    render(createElement(MockApp, { requestedScreen: 'faq', store }))
    await user.click(within(screen.getByText('質問B').closest('article')!).getByRole('button', { name: '編集' }))
    expect(screen.getByRole('heading', { name: 'FAQ編集' })).toBeInTheDocument()
    expect(screen.getByLabelText('FAQ質問')).toHaveValue('質問B')
    expect(screen.getByLabelText('FAQ回答')).toHaveValue('回答B')
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
  })
})

describe('FAQ管理画面', () => {
  it('未認証はログインへ移動し一般社員は拒否する', () => {
    const { rerender } = render(createElement(MockApp, { requestedScreen: 'faq-admin', role: null }))
    expect(screen.getByRole('heading', { name: 'ログイン' })).toBeInTheDocument()
    rerender(createElement(MockApp, { requestedScreen: 'faq-admin', role: 'employee' }))
    expect(screen.getByRole('alert')).toHaveTextContent('権限がありません')
  })

  it('空白改行だけを無効にしUnicode書記素1000まで反映して登録する', async () => {
    const user = userEvent.setup()
    const store = authenticatedStore('admin', { faqs: [] })
    render(createElement(MockApp, { requestedScreen: 'faq-admin', store }))
    const question = screen.getByLabelText('FAQ質問')
    const answer = screen.getByLabelText('FAQ回答')
    await user.type(question, ' \n ')
    await user.type(answer, '回答')
    expect(screen.getByRole('button', { name: '登録' })).toBeDisabled()

    const thousand = `${'あ'.repeat(999)}👨‍👩‍👧‍👦`
    fireEvent.change(question, { target: { value: `${thousand}超過` } })
    expect(question).toHaveValue(thousand)
    await user.clear(answer)
    await user.type(answer, '結合文字éと改行\nを含む回答')
    await user.click(screen.getByRole('button', { name: '登録' }))
    expect(screen.getByRole('status')).toHaveTextContent('FAQを登録しました')
    expect(store.getFaqs()).toContainEqual(expect.objectContaining({ question: thousand, answer: '結合文字éと改行\nを含む回答' }))
  })

  it('画面を迂回した1001書記素の登録を拒否してstoreを変更しない', () => {
    const store = authenticatedStore('admin', { faqs: [] })
    expect(() => store.addFaq('あ'.repeat(1001), '回答')).toThrow()
    expect(() => store.addFaq('質問', 'あ'.repeat(1001))).toThrow()
    expect(store.getFaqs()).toEqual([])
  })

  it('編集、無変更保存、自身同一を許可し対象外FAQとの完全一致を拒否する', async () => {
    const user = userEvent.setup()
    const faqs = [
      { id: 'faq-a', question: '質問A', answer: '回答A' },
      { id: 'faq-b', question: '質問B', answer: '回答B' },
    ]
    const store = authenticatedStore('admin', { faqs })
    render(createElement(MockApp, { requestedScreen: 'faq', store }))
    await user.click(within(screen.getByText('質問A').closest('article')!).getByRole('button', { name: '編集' }))
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(screen.getByRole('status')).toHaveTextContent('FAQを修正しました')

    await user.clear(screen.getByLabelText('FAQ回答'))
    await user.type(screen.getByLabelText('FAQ回答'), '変更回答')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(store.getFaqs().find(({ id }) => id === 'faq-a')?.answer).toBe('変更回答')

    await user.clear(screen.getByLabelText('FAQ質問'))
    await user.type(screen.getByLabelText('FAQ質問'), '質問B')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(screen.getByRole('alert')).toHaveTextContent('同じ質問が登録済みです')
    expect(store.getFaqs().find(({ id }) => id === 'faq-a')?.question).toBe('質問A')
    expect(screen.queryByRole('button', { name: /削除/ })).not.toBeInTheDocument()
  })

  it('新規登録の完全一致競合ではstoreを変更しない', async () => {
    const user = userEvent.setup()
    const store = authenticatedStore('admin', { faqs: [{ id: 'faq-a', question: '同じ質問', answer: '既存回答' }] })
    render(createElement(MockApp, { requestedScreen: 'faq-admin', store }))
    await user.type(screen.getByLabelText('FAQ質問'), '同じ質問')
    await user.type(screen.getByLabelText('FAQ回答'), '新回答')
    await user.click(screen.getByRole('button', { name: '登録' }))
    expect(screen.getByRole('alert')).toHaveTextContent('同じ質問が登録済みです')
    expect(store.getFaqs()).toHaveLength(1)
  })

  it.each([
    ['未認証', null],
    ['一般社員', 'employee'],
  ] as const)('%sの直接登録と更新を拒否して状態を変更しない', (_label, role) => {
    const initial = [{ id: 'faq-a', question: '既存質問', answer: '既存回答' }]
    const store = role === 'employee'
      ? authenticatedStore('employee', { faqs: initial })
      : createMockStore(new ManualClock(NOW), { faqs: initial })

    expect(() => store.addFaq('不正な追加', '不正な回答')).toThrow('権限がありません')
    expect(() => store.updateFaq('faq-a', '不正な更新', '不正な回答')).toThrow('権限がありません')
    expect(store.getFaqs()).toEqual(initial)
  })

  it.each([
    ['質問0書記素', '', '回答', false],
    ['回答0書記素', '質問', '', false],
    ['質問1書記素', '問', '回答', true],
    ['回答1書記素', '質問', '答', true],
    ['質問1000書記素', '問'.repeat(1000), '回答', true],
    ['回答1000書記素', '質問', '答'.repeat(1000), true],
    ['質問1001書記素', '問'.repeat(1001), '回答', false],
    ['回答1001書記素', '質問', '答'.repeat(1001), false],
  ] as const)('直接登録の%s境界を検証する', (_label, question, answer, accepted) => {
    const store = authenticatedStore('admin', { faqs: [] })
    if (accepted) expect(() => store.addFaq(question, answer)).not.toThrow()
    else expect(() => store.addFaq(question, answer)).toThrow()
    expect(store.getFaqs()).toHaveLength(accepted ? 1 : 0)
  })

  it.each([
    ['質問0書記素', '', '更新回答', false],
    ['回答0書記素', '更新質問', '', false],
    ['質問1書記素', '問', '更新回答', true],
    ['回答1書記素', '更新質問', '答', true],
    ['質問1000書記素', '問'.repeat(1000), '更新回答', true],
    ['回答1000書記素', '更新質問', '答'.repeat(1000), true],
    ['質問1001書記素', '問'.repeat(1001), '更新回答', false],
    ['回答1001書記素', '更新質問', '答'.repeat(1001), false],
  ] as const)('直接更新の%s境界を検証する', (_label, question, answer, accepted) => {
    const initial = [{ id: 'faq-a', question: '既存質問', answer: '既存回答' }]
    const store = authenticatedStore('admin', { faqs: initial })
    if (accepted) expect(() => store.updateFaq('faq-a', question, answer)).not.toThrow()
    else expect(() => store.updateFaq('faq-a', question, answer)).toThrow()
    expect(store.getFaqs()).toEqual(accepted ? [{ id: 'faq-a', question, answer }] : initial)
  })
})
