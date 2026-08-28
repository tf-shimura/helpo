import { describe, expect, it } from 'vitest'
import { ManualClock } from '../../src/shared/mock/manual-clock'

describe('ManualClock', () => {
  it('境界直前と境界ちょうどへ決定的に進められる', () => {
    const clock = new ManualClock(new Date('2026-08-28T00:00:00.000Z'))

    clock.advanceBy(10 * 60 * 1000 - 1)
    expect(clock.now().toISOString()).toBe('2026-08-28T00:09:59.999Z')

    clock.advanceBy(1)
    expect(clock.now().toISOString()).toBe('2026-08-28T00:10:00.000Z')

    clock.advanceBy(24 * 60 * 60 * 1000 - 1)
    expect(clock.now().toISOString()).toBe('2026-08-29T00:09:59.999Z')

    clock.advanceBy(1)
    expect(clock.now().toISOString()).toBe('2026-08-29T00:10:00.000Z')
  })
})
