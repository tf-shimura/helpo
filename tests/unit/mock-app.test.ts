import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { MockApp } from '../../src/MockApp'
import { ManualClock } from '../../src/shared/mock/manual-clock'
import { createMockStore } from '../../src/shared/mock/mock-store'
import { resolveScreen } from '../../src/shared/mock/screen-access'

describe('ブラウザ内モック状態', () => {
  it('認証状態、失敗回数、ロック、セッションを保持する', () => {
    const clock = new ManualClock(new Date('2026-08-28T00:00:00Z'))
    const store = createMockStore(clock)

    expect(store.authenticate('E001', 'employee-pass').status).toBe('authenticated')
    expect(store.getCurrentUser()?.role).toBe('employee')
    expect(store.getSession()).toEqual({
      accountId: 'employee-1',
      startedAt: new Date('2026-08-28T00:00:00Z'),
      expiresAt: new Date('2026-08-29T00:00:00Z'),
    })
    clock.advanceBy(24 * 60 * 60 * 1000 - 1)
    expect(store.getCurrentUser()?.id).toBe('employee-1')
    clock.advanceBy(1)
    expect(store.getCurrentUser()).toBeNull()

    clock.set(new Date('2026-08-28T00:00:00Z'))
    store.logout()
    for (let count = 1; count < 5; count += 1) {
      expect(store.authenticate('E001', 'wrong').status).toBe('invalid')
    }
    expect(store.authenticate('E001', 'wrong').status).toBe('locked')
    expect(store.authenticate('E001', 'employee-pass').status).toBe('locked')

    clock.advanceBy(10 * 60 * 1000)
    expect(store.authenticate('E001', 'employee-pass').status).toBe('authenticated')
  })

  it('任意のロック状態とセッション状態を初期化できる', () => {
    const clock = new ManualClock(new Date('2026-08-28T00:09:59.999Z'))
    const lockedUntil = new Date('2026-08-28T00:10:00Z')
    const store = createMockStore(clock, {
      loginAttempts: { E001: { failures: 0, lockedUntil } },
      session: {
        accountId: 'admin-1',
        startedAt: new Date('2026-08-27T00:10:00Z'),
        expiresAt: new Date('2026-08-28T00:10:00Z'),
      },
    })

    expect(store.getCurrentUser()?.role).toBe('admin')
    expect(store.authenticate('E001', 'employee-pass').status).toBe('locked')
    clock.advanceBy(1)
    expect(store.getCurrentUser()).toBeNull()
    expect(store.authenticate('E001', 'employee-pass').status).toBe('authenticated')
  })

  it('FAQを登録・更新し、完全一致の回答シナリオと空状態を再現する', () => {
    const store = createMockStore(new ManualClock(), { faqs: [] })
    expect(store.getFaqs()).toEqual([])
    const faq = store.addFaq('在宅勤務はできますか？', '週2日まで利用できます。')
    const secondFaq = store.addFaq('申請方法は？', '勤怠システムから申請します。')

    expect(store.getAnswerScenario('在宅勤務はできますか？')).toMatchObject({
      kind: 'answer',
      sources: [faq.id],
    })
    expect(store.getAnswerScenario('在宅勤務')).toEqual({ kind: 'unavailable' })
    expect(store.getAnswerScenario('__MULTI__')).toEqual({
      kind: 'answer',
      answer: '週2日まで利用できます。\n勤怠システムから申請します。',
      sources: [faq.id, secondFaq.id],
    })
    expect(store.updateFaq(faq.id, '在宅勤務の上限は？', '週2日までです。').question).toBe('在宅勤務の上限は？')
    expect(store.getAnswerScenario('登録のない質問')).toEqual({ kind: 'unavailable' })
    expect(store.getAnswerScenario('__ERROR__')).toEqual({ kind: 'failure' })
  })

  it('seed済みFAQと衝突しないIDを発行する', () => {
    const seededFaq = { id: 'faq-2', question: '既存質問', answer: '既存回答' }
    const store = createMockStore(new ManualClock(), { faqs: [seededFaq] })
    const added = store.addFaq('追加質問', '追加回答')
    const another = store.addFaq('別の質問', '別の回答')

    expect(new Set(store.getFaqs().map(({ id }) => id)).size).toBe(3)
    expect(added.id).not.toBe(seededFaq.id)
    expect(another.id).not.toBe(seededFaq.id)
    expect(store.getAnswerScenario('追加質問')).toMatchObject({ sources: [added.id] })
  })

  it('履歴と評価を現在の社員に限定する', () => {
    const store = createMockStore(new ManualClock(new Date('2026-08-28T00:00:00Z')))
    store.authenticate('E001', 'employee-pass')
    const employeeEntry = store.addHistory('社員の質問', '社員への回答')
    expect(store.rateAnswer(employeeEntry.id, 'good')).toBe(true)

    store.logout()
    store.authenticate('A001', 'admin-pass')
    const adminEntry = store.addHistory('管理者の質問', '管理者への回答')
    expect(store.getHistory().map(({ id }) => id)).toEqual([adminEntry.id])
    expect(store.rateAnswer(employeeEntry.id, 'bad')).toBe(false)

    store.logout()
    store.authenticate('E001', 'employee-pass')
    expect(store.getHistory().map(({ id }) => id)).toEqual([employeeEntry.id])
    expect(store.getHistory()[0].feedback).toBe('good')
  })

  it('seed済み履歴と衝突せず新規回答だけを評価する', () => {
    const store = createMockStore(new ManualClock(new Date('2026-08-28T00:00:00Z')), {
      histories: [{
        id: 'history-1',
        accountId: 'employee-1',
        askedAt: new Date('2026-08-27T00:00:00Z'),
        question: '既存質問',
        answer: '既存回答',
        feedback: null,
      }],
    })
    store.authenticate('E001', 'employee-pass')
    const added = store.addHistory('新規質問', '新規回答')

    expect(added.id).not.toBe('history-1')
    expect(store.rateAnswer(added.id, 'good')).toBe(true)
    expect(store.getHistory().find(({ id }) => id === 'history-1')?.feedback).toBeNull()
    expect(store.getHistory().find(({ id }) => id === added.id)?.feedback).toBe('good')
  })
})

describe('5画面のアクセス判定', () => {
  it.each([
    ['login', null, 'login'],
    ['question', null, 'login'],
    ['history', null, 'login'],
    ['faq', null, 'login'],
    ['faq-admin', null, 'login'],
    ['login', 'employee', 'question'],
    ['question', 'employee', 'question'],
    ['history', 'employee', 'history'],
    ['faq', 'employee', 'faq'],
    ['faq-admin', 'employee', 'forbidden'],
    ['login', 'admin', 'question'],
    ['question', 'admin', 'question'],
    ['history', 'admin', 'history'],
    ['faq', 'admin', 'faq'],
    ['faq-admin', 'admin', 'faq-admin'],
  ] as const)('%sへ%sでアクセスすると%sを返す', (requested, role, expected) => {
    expect(resolveScreen(requested, role)).toEqual({ screen: expected })
  })

  it('各表示先に固有の画面骨格を表示する', () => {
    const { rerender } = render(createElement(MockApp, { requestedScreen: 'login', role: null }))
    expect(screen.getByRole('heading', { name: 'ログイン' })).toBeInTheDocument()

    rerender(createElement(MockApp, { requestedScreen: 'history', role: 'employee' }))
    expect(screen.getByRole('heading', { name: '質問履歴' })).toBeInTheDocument()

    rerender(createElement(MockApp, { requestedScreen: 'faq-admin', role: 'employee' }))
    expect(screen.getByRole('alert')).toHaveTextContent('権限がありません')
  })
})
