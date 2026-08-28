export type LogMetadata = Readonly<{
  requestId: string
  route: string
  status?: number
  errorCode?: string
  durationMs?: number
  actorIdHash?: string
  providerClassification?: 'authentication' | 'rate_limit' | 'invalid_output' | 'service_error' | 'timeout'
}>

export interface RedactingLogger {
  info(metadata: LogMetadata): void
  error(metadata: LogMetadata): void
}
