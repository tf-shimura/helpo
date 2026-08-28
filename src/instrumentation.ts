import { parseServerConfig } from './shared/config/server-config'

export const runtime = 'nodejs'

export function register() {
  parseServerConfig(process.env)
}
