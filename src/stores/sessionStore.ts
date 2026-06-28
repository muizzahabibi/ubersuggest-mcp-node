import type { RateLimitState, SessionMetadata, FeatureName } from '../domain/types/session.js'

export interface SessionStore {
  getSession(sessionId: string): Promise<SessionMetadata | undefined>
  putSession(session: SessionMetadata): Promise<void>
  touchSession(sessionId: string, updates: {
    subject?: string
    ownerType?: SessionMetadata['ownerType']
    createdAt?: number
    updatedAt?: number
    status?: SessionMetadata['status']
    capturedAt?: number
    lastValidatedAt?: number
    defaultProjectId?: string
    defaultWorkspaceId?: string
    bootstrapUserPath?: string
    bootstrapGetTokenPath?: string
    errorMessage?: string
    authBundleSecretId?: string
  }): Promise<SessionMetadata>
  resetAuth(sessionId: string, updates: {
    updatedAt: number
    status: SessionMetadata['status']
    errorMessage?: string
  }): Promise<SessionMetadata>
  updateReferer(sessionId: string, feature: FeatureName, referer: string): Promise<void>
  updateRateLimitState(sessionId: string, state: RateLimitState | undefined): Promise<void>
}
