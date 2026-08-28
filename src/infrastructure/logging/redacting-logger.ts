import 'server-only'
import type { LogMetadata, RedactingLogger } from '../../application/logging/redacting-logger'

export class ConsoleRedactingLogger implements RedactingLogger {
  info(metadata: LogMetadata): void {
    console.log(JSON.stringify({ level: 'info', ...metadata }))
  }

  error(metadata: LogMetadata): void {
    console.error(JSON.stringify({ level: 'error', ...metadata }))
  }
}
