import type { FeatureName } from './session.js'

export interface WarningEnvelope {
  warnings: string[]
}

export interface RequestOptions {
  sessionId?: string
  feature: FeatureName
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
}
