import type { Clock } from '../time/clock'

export class ManualClock implements Clock {
  private timestamp: number

  constructor(initialTime: Date = new Date()) {
    this.timestamp = initialTime.getTime()
  }

  now(): Date {
    return new Date(this.timestamp)
  }

  advanceBy(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new RangeError('進める時間は0以上の有限値で指定してください')
    }

    this.timestamp += milliseconds
  }

  set(time: Date): void {
    const timestamp = time.getTime()
    if (!Number.isFinite(timestamp)) throw new RangeError('有効な日時を指定してください')
    this.timestamp = timestamp
  }
}
