import { describe, expect, it } from 'vitest'
import { ControlledAnswer } from '../../src/shared/mock/controlled-answer'

describe('ControlledAnswer', () => {
  it('回答チャンクと完了を手動で進められる', () => {
    const answer = new ControlledAnswer(['回答', 'です'], ['FAQ 1'])

    expect(answer.snapshot()).toEqual({ status: 'pending', text: '', sources: [] })
    answer.advance()
    expect(answer.snapshot()).toEqual({ status: 'streaming', text: '回答', sources: [] })
    answer.advance()
    expect(answer.snapshot()).toEqual({ status: 'streaming', text: '回答です', sources: [] })
    answer.complete()
    expect(answer.snapshot()).toEqual({ status: 'completed', text: '回答です', sources: ['FAQ 1'] })
  })

  it('任意の中間時点で完了、回答不能、途中失敗、中断を確定できる', () => {
    const completed = new ControlledAnswer(['途中', '完了'], ['FAQ 1'])
    completed.advance()
    completed.complete()
    expect(completed.snapshot()).toEqual({ status: 'completed', text: '途中完了', sources: ['FAQ 1'] })

    const unavailable = new ControlledAnswer(['途中', '未使用'])
    unavailable.advance()
    unavailable.markUnavailable()
    expect(unavailable.snapshot()).toEqual({ status: 'unavailable', text: '', sources: [] })

    const failed = new ControlledAnswer(['途中'])
    failed.advance()
    failed.fail()
    expect(failed.snapshot()).toEqual({ status: 'failed', text: '途中', sources: [] })

    const aborted = new ControlledAnswer(['途中', '未使用'])
    aborted.advance()
    aborted.abort()
    expect(aborted.snapshot()).toEqual({ status: 'aborted', text: '途中', sources: [] })
  })
})
