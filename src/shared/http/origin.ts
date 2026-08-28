export function isValidOrigin(origin: string | null, canonicalOrigin: string): boolean {
  if (origin === null || origin === '' || origin === 'null') return false
  return origin === canonicalOrigin
}
