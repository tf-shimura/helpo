import 'server-only'
import { verify } from 'argon2'
import type { PasswordVerifier } from '../../shared/security/password-verifier'

export class Argon2PasswordVerifier implements PasswordVerifier {
  async verify(password: string, hash: string): Promise<boolean> {
    try {
      return await verify(hash, password)
    } catch {
      return false
    }
  }
}
