import { createHash, randomBytes } from 'node:crypto'

export interface SessionTokenizer {
  generate(): { rawToken: string; tokenHash: string }
  hash(rawToken: string): string
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('base64url')
}

export class RandomSessionTokenizer implements SessionTokenizer {
  generate(): { rawToken: string; tokenHash: string } {
    const rawToken = randomBytes(32).toString('base64url')
    return { rawToken, tokenHash: hashToken(rawToken) }
  }

  hash(rawToken: string): string {
    return hashToken(rawToken)
  }
}
