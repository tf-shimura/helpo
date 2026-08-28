import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { setupClientIntegration, setOpenAiJson, type Harness } from './harness'

describe('HTTP/session/error contract integration matrix', () => {
  let harness: Harness

  beforeEach(async () => {
    setOpenAiJson({ output_text: JSON.stringify({ unanswerable: true }) })
    harness = await setupClientIntegration()
  })

  afterEach(async () => {
    await harness.dispose()
  })

  it('login成功でActorを返し、getSessionで復元・logoutで無効化する', async () => {
    const login = await harness.client.login({
      employeeId: harness.seeded.employee.employeeId,
      password: harness.seeded.employee.password,
    })
    expect(login.ok).toBe(true)
    if (!login.ok) return
    expect(login.value.employeeId).toBe(harness.seeded.employee.employeeId)
    expect(login.value.role).toBe('EMPLOYEE')

    const session = await harness.client.getSession()
    expect(session.ok).toBe(true)
    if (!session.ok) return
    expect(session.value.employeeId).toBe(harness.seeded.employee.employeeId)

    const logout = await harness.client.logout()
    expect(logout.ok).toBe(true)

    const afterLogout = await harness.client.getSession()
    expect(afterLogout.ok).toBe(false)
    if (afterLogout.ok) return
    expect(afterLogout.status).toBe(401)
    expect(afterLogout.code).toBe('UNAUTHENTICATED')
  })

  it('login失敗でINVALID_CREDENTIALSを返す', async () => {
    const result = await harness.client.login({
      employeeId: harness.seeded.employee.employeeId,
      password: 'wrong',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(401)
    expect(result.code).toBe('INVALID_CREDENTIALS')
  })

  it('5回連続失敗後にLOGIN_LOCKEDを返す', async () => {
    for (let i = 0; i < 5; i += 1) {
      const result = await harness.client.login({
        employeeId: harness.seeded.employee.employeeId,
        password: 'wrong',
      })
      expect(result.ok).toBe(false)
      if (result.ok) continue
      if (i < 4) {
        expect(result.code).toBe('INVALID_CREDENTIALS')
      } else {
        expect(result.code).toBe('LOGIN_LOCKED')
        expect(result.retryAt).toBeDefined()
      }
    }

    const locked = await harness.client.login({
      employeeId: harness.seeded.employee.employeeId,
      password: harness.seeded.employee.password,
    })
    expect(locked.ok).toBe(false)
    if (locked.ok) return
    expect(locked.status).toBe(423)
    expect(locked.code).toBe('LOGIN_LOCKED')
  })

  it('未認証で保護APIはUNAUTHENTICATEDを返す', async () => {
    const results = await Promise.all([
      harness.client.listFaqs(),
      harness.client.listHistory(),
      harness.client.createFaq({ question: 'Q', answer: 'A' }),
      harness.client.updateFaq('550e8400-e29b-41d4-a716-446655440000', { question: 'Q', answer: 'A' }),
      harness.client.submitFeedback('550e8400-e29b-41d4-a716-446655440000', 'GOOD'),
      harness.client.streamAnswer('有給はいつまでにいえばいい？', new AbortController().signal),
    ])

    for (const result of results) {
      expect(result.ok).toBe(false)
      if (result.ok) continue
      expect(result.status).toBe(401)
      expect(result.code).toBe('UNAUTHENTICATED')
    }
  })

  it('一般社員がFAQ管理を行うとFORBIDDENを返す', async () => {
    await harness.client.login({
      employeeId: harness.seeded.employee.employeeId,
      password: harness.seeded.employee.password,
    })

    const create = await harness.client.createFaq({ question: 'Q', answer: 'A' })
    expect(create.ok).toBe(false)
    if (create.ok) return
    expect(create.status).toBe(403)
    expect(create.code).toBe('FORBIDDEN')

    const update = await harness.client.updateFaq(harness.seeded.faq.id, { question: 'Q2', answer: 'A2' })
    expect(update.ok).toBe(false)
    if (update.ok) return
    expect(update.status).toBe(403)
    expect(update.code).toBe('FORBIDDEN')
  })

  it('loginの入力検証でVALIDATION_ERRORとfieldsを返す', async () => {
    const result = await harness.client.login({ employeeId: '', password: '' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(400)
    expect(result.code).toBe('VALIDATION_ERROR')
    expect(result.fields).toBeDefined()
  })

  it('FAQ登録の入力検証でVALIDATION_ERRORとfieldsを返す', async () => {
    await harness.client.login({
      employeeId: harness.seeded.admin.employeeId,
      password: harness.seeded.admin.password,
    })

    const result = await harness.client.createFaq({ question: '', answer: '' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(400)
    expect(result.code).toBe('VALIDATION_ERROR')
    expect(result.fields).toBeDefined()
  })

  it('質問の入力検証でVALIDATION_ERRORとfieldsを返す', async () => {
    await harness.client.login({
      employeeId: harness.seeded.employee.employeeId,
      password: harness.seeded.employee.password,
    })

    const result = await harness.client.streamAnswer('', new AbortController().signal)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(400)
    expect(result.code).toBe('VALIDATION_ERROR')
    expect(result.fields).toBeDefined()
  })

  it('FAQ重複でFAQ_QUESTION_CONFLICTを返す', async () => {
    await harness.client.login({
      employeeId: harness.seeded.admin.employeeId,
      password: harness.seeded.admin.password,
    })

    const first = await harness.client.createFaq({ question: '重複質問', answer: 'A' })
    expect(first.ok).toBe(true)

    const second = await harness.client.createFaq({ question: '重複質問', answer: 'A' })
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.status).toBe(409)
    expect(second.code).toBe('FAQ_QUESTION_CONFLICT')
  })

  it('存在しないFAQ更新でNOT_FOUNDを返す', async () => {
    await harness.client.login({
      employeeId: harness.seeded.admin.employeeId,
      password: harness.seeded.admin.password,
    })

    const result = await harness.client.updateFaq('550e8400-e29b-41d4-a716-446655440000', {
      question: 'Q',
      answer: 'A',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(404)
    expect(result.code).toBe('NOT_FOUND')
  })

  it('存在しない回答へfeedbackでNOT_FOUNDを返す', async () => {
    await harness.client.login({
      employeeId: harness.seeded.employee.employeeId,
      password: harness.seeded.employee.password,
    })

    const result = await harness.client.submitFeedback('550e8400-e29b-41d4-a716-446655440000', 'GOOD')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(404)
    expect(result.code).toBe('NOT_FOUND')
  })

  it('同一回答への重複feedbackでFEEDBACK_CONFLICTを返す', async () => {
    await harness.client.login({
      employeeId: harness.seeded.employee.employeeId,
      password: harness.seeded.employee.password,
    })

    setOpenAiJson({
      output_text: JSON.stringify({
        selections: [{ faqId: harness.seeded.faq.id, quote: harness.seeded.faq.answer }],
      }),
    })

    const stream = await harness.client.streamAnswer('質問', new AbortController().signal)
    expect(stream.ok).toBe(true)
    if (!stream.ok) return

    let answerId: string | undefined
    for await (const event of stream.value) {
      if (event.type === 'start') answerId = event.answerId
    }
    if (!answerId) throw new Error('answerId not found')

    const first = await harness.client.submitFeedback(answerId, 'GOOD')
    expect(first.ok).toBe(true)

    const second = await harness.client.submitFeedback(answerId, 'GOOD')
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.status).toBe(409)
    expect(second.code).toBe('FEEDBACK_CONFLICT')
  })
})
