export class FakeClock {
  private timestamp: number

  constructor(initialTime: Date) {
    this.timestamp = initialTime.getTime()
  }

  now(): Date {
    return new Date(this.timestamp)
  }

  advanceBy(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new RangeError('Invalid duration')
    this.timestamp += milliseconds
  }
}
