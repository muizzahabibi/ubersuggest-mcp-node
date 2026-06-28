export type BrowserAuthMode = 'profile' | 'cookies'
export type SessionStatus = 'ready' | 'refreshing' | 'reconnect_required' | 'error'
export type BrowserChannel = 'chromium' | 'chrome'
export type CookiesFormat = 'json' | 'netscape' | 'header'
export type RuntimeCookiesFormat = CookiesFormat | 'auto'
export type FeatureName = 'bootstrap' | 'traffic' | 'keyword' | 'siteAudit' | 'backlinks'
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface RuntimeCookieOverride {
  raw: string
  format: RuntimeCookiesFormat
}

export interface RateLimitState {
  remaining?: number
  resetAt?: number
  requestCost?: number
}

export interface AuthBundle {
  cookiesHeader: string
  authorizationBearer: string
  xUbsData: string
}

export interface CapturedRuntimeHeaders extends AuthBundle {
  ts?: string
  referer?: string
  observedUserUrl?: string
  observedGetTokenUrl?: string
}

export interface SessionMetadata {
  sessionId: string
  subject?: string
  ownerType?: 'user'
  createdAt?: number
  updatedAt?: number
  status: SessionStatus
  authBundleSecretId?: string
  capturedAt?: number
  lastValidatedAt?: number
  defaultProjectId?: string
  defaultWorkspaceId?: string
  bootstrapUserPath?: string
  bootstrapGetTokenPath?: string
  lastRefererByFeature: Partial<Record<FeatureName, string>>
  lastRateLimitState?: RateLimitState
  lockOwner?: string
  lockExpiresAt?: number
  version?: number
  errorMessage?: string
}

export interface RuntimeSession extends AuthBundle {
  sessionId: string
  capturedAt: number
  lastValidatedAt: number
  defaultProjectId?: string
  defaultWorkspaceId?: string
  bootstrapUserPath?: string
  bootstrapGetTokenPath?: string
  lastRefererByFeature: Partial<Record<FeatureName, string>>
  lastRateLimitState?: RateLimitState
}

export interface BrowserBootstrapResult extends AuthBundle {
  capturedAt: number
  lastValidatedAt: number
  defaultProjectId?: string
  defaultWorkspaceId?: string
  bootstrapUserPath?: string
  bootstrapGetTokenPath?: string
  lastRefererByFeature: Partial<Record<FeatureName, string>>
}

export type BrowserBootstrapInput =
  | {
      authMode: 'profile'
      profilePath: string
      chromeProfileDirectory?: string
    }
  | {
      authMode: 'cookies'
      cookies: RuntimeCookieOverride
    }

export interface ReconnectJobRecord {
  jobId: string
  sessionId: string
  subject: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  createdAt: number
  updatedAt: number
  errorMessage?: string
}

export interface ReconnectWorkerPayload {
  jobId: string
  sessionId: string
  subject: string
  input: BrowserBootstrapInput
  requestedAt: number
}
