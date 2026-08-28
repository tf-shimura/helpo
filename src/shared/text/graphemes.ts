const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' })

export function splitGraphemes(value: string): string[] {
  return Array.from(segmenter.segment(value), ({ segment }) => segment)
}

export function countGraphemes(value: string): number {
  return splitGraphemes(value).length
}

export function isBlankInput(value: string): boolean {
  return value.trim().length === 0
}

export function truncateGraphemes(value: string, limit: number): string {
  assertLimit(limit)
  return splitGraphemes(value).slice(0, limit).join('')
}

export function validateGraphemeLimit(value: string, limit: number): boolean {
  assertLimit(limit)
  return countGraphemes(value) <= limit
}

function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError('上限は0以上の整数で指定してください')
}
