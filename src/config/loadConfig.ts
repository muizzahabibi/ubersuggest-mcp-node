import { ConfigError } from '../utils/errors.js'
import type { LogLevel } from '../domain/types/session.js'

export interface CloudflareBindings {
  UBERSUGGEST_DB: D1Database
  SESSION_COORDINATOR: DurableObjectNamespace
  UBERSUGGEST_BASE_URL?: string
  UBERSUGGEST_OAUTH_SIGNING_SECRET?: string
  UBERSUGGEST_OAUTH_USERS_JSON?: string
  UBERSUGGEST_OAUTH_ACCESS_TOKEN_TTL_SECONDS?: string
  UBERSUGGEST_OAUTH_AUTHORIZATION_CODE_TTL_SECONDS?: string
  UBERSUGGEST_OAUTH_INVITE_TTL_SECONDS?: string
  UBERSUGGEST_OAUTH_PASSWORD_MIN_LENGTH?: string
  UBERSUGGEST_PUBLIC_BASE_URL?: string
  UBERSUGGEST_BOOTSTRAP_PATH?: string
  UBERSUGGEST_REQUEST_TIMEOUT_MS?: string
  UBERSUGGEST_POLL_INTERVAL_MS?: string
  UBERSUGGEST_POLL_TIMEOUT_MS?: string
  UBERSUGGEST_LOG_LEVEL?: LogLevel
  UBERSUGGEST_TOP_COUNTRIES_LANG_LOCS?: string
  UBERSUGGEST_AUTH_TOKENS_JSON?: string
  UBERSUGGEST_AWS_BOOTSTRAP_URL?: string
  UBERSUGGEST_AWS_BOOTSTRAP_SHARED_SECRET?: string
  UBERSUGGEST_AUTH_ENCRYPTION_KEY?: string
  UBERSUGGEST_LOCK_TIMEOUT_MS?: string
  UBERSUGGEST_SESSION_REVALIDATE_AGE_MS?: string
  UBERSUGGEST_ENABLE_JSON_RESPONSE?: string
  UBERSUGGEST_DIAGNOSTIC_LOGGING?: string
  UBERSUGGEST_DIAGNOSTIC_LOG_SAMPLE_RATE?: string
  UBERSUGGEST_DIAGNOSTIC_LOG_ROUTES?: string
}

export interface DiagnosticLoggingConfig {
  enabled: boolean
  sampleRate: number
  routes: string[]
}

export interface UbersuggestAwsConfig {
  baseUrl: string
  publicBaseUrl?: string
  oauthSigningSecret: string
  oauthUsers: Record<string, string>
  oauthAccessTokenTtlSeconds: number
  oauthAuthorizationCodeTtlSeconds: number
  oauthInviteTtlSeconds: number
  oauthPasswordMinLength: number
  bootstrapPath: string
  requestTimeoutMs: number
  pollIntervalMs: number
  pollTimeoutMs: number
  logLevel: LogLevel
  topCountriesLangLocs: string[]
  lockTimeoutMs: number
  sessionRevalidateAgeMs: number
  enableJsonResponse: boolean
  diagnosticLogging: DiagnosticLoggingConfig
  authTokens: Record<string, string>
  awsBootstrapUrl?: string
  awsBootstrapSharedSecret?: string
  authEncryptionKey: string
  authSecretPrefix: string
  db: D1Database
  sessionCoordinator: DurableObjectNamespace
}

export function loadConfig(env: CloudflareBindings): UbersuggestAwsConfig {
  const authTokens = parseAuthTokens(env.UBERSUGGEST_AUTH_TOKENS_JSON)
  const oauthSigningSecret = env.UBERSUGGEST_OAUTH_SIGNING_SECRET?.trim()
  if (!oauthSigningSecret) {
    throw new ConfigError('UBERSUGGEST_OAUTH_SIGNING_SECRET is required')
  }

  const rawOauthUsers = env.UBERSUGGEST_OAUTH_USERS_JSON?.trim()
  if (!rawOauthUsers) {
    throw new ConfigError('UBERSUGGEST_OAUTH_USERS_JSON is required')
  }
  const oauthUsers = parseAuthTokens(rawOauthUsers)

  const authEncryptionKey = env.UBERSUGGEST_AUTH_ENCRYPTION_KEY?.trim()
  if (!authEncryptionKey) {
    throw new ConfigError('UBERSUGGEST_AUTH_ENCRYPTION_KEY is required')
  }

  return {
    baseUrl: env.UBERSUGGEST_BASE_URL?.trim() || 'https://app.neilpatel.com',
    publicBaseUrl: env.UBERSUGGEST_PUBLIC_BASE_URL?.trim() || undefined,
    oauthSigningSecret,
    oauthUsers,
    oauthAccessTokenTtlSeconds: toNumber(env.UBERSUGGEST_OAUTH_ACCESS_TOKEN_TTL_SECONDS, 604800),
    oauthAuthorizationCodeTtlSeconds: toNumber(env.UBERSUGGEST_OAUTH_AUTHORIZATION_CODE_TTL_SECONDS, 300),
    oauthInviteTtlSeconds: toNumber(env.UBERSUGGEST_OAUTH_INVITE_TTL_SECONDS, 86400),
    oauthPasswordMinLength: toNumber(env.UBERSUGGEST_OAUTH_PASSWORD_MIN_LENGTH, 12),
    bootstrapPath: env.UBERSUGGEST_BOOTSTRAP_PATH?.trim() || '/en/dashboard',
    requestTimeoutMs: toNumber(env.UBERSUGGEST_REQUEST_TIMEOUT_MS, 30_000),
    pollIntervalMs: toNumber(env.UBERSUGGEST_POLL_INTERVAL_MS, 1_500),
    pollTimeoutMs: toNumber(env.UBERSUGGEST_POLL_TIMEOUT_MS, 20_000),
    logLevel: (env.UBERSUGGEST_LOG_LEVEL?.trim() as LogLevel | undefined) || 'info',
    topCountriesLangLocs: (env.UBERSUGGEST_TOP_COUNTRIES_LANG_LOCS || 'id:2360,en:2360,en:2840').split(',').map((part) => part.trim()).filter(Boolean),
    lockTimeoutMs: toNumber(env.UBERSUGGEST_LOCK_TIMEOUT_MS, 120_000),
    sessionRevalidateAgeMs: toNumber(env.UBERSUGGEST_SESSION_REVALIDATE_AGE_MS, 86_400_000),
    enableJsonResponse: env.UBERSUGGEST_ENABLE_JSON_RESPONSE !== 'false',
    diagnosticLogging: {
      enabled: env.UBERSUGGEST_DIAGNOSTIC_LOGGING === 'true',
      sampleRate: clampRate(env.UBERSUGGEST_DIAGNOSTIC_LOG_SAMPLE_RATE),
      routes: (env.UBERSUGGEST_DIAGNOSTIC_LOG_ROUTES || '').split(',').map((part) => part.trim()).filter(Boolean),
    },
    authTokens,
    awsBootstrapUrl: env.UBERSUGGEST_AWS_BOOTSTRAP_URL?.trim() || undefined,
    awsBootstrapSharedSecret: env.UBERSUGGEST_AWS_BOOTSTRAP_SHARED_SECRET?.trim() || undefined,
    authEncryptionKey,
    authSecretPrefix: 'ubersuggest-mcp-cf/auth-bundles',
    db: env.UBERSUGGEST_DB,
    sessionCoordinator: env.SESSION_COORDINATOR,
  }
}

function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function clampRate(value: string | undefined): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return 0
  }
  return Math.max(0, Math.min(1, parsed))
}

function parseAuthTokens(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('must be a JSON object')
    }
    return Object.fromEntries(
      Object.entries(parsed).map(([username, token]) => [String(username), String(token)]),
    )
  } catch (error) {
    throw new ConfigError(`UBERSUGGEST_AUTH_TOKENS_JSON is invalid: ${error instanceof Error ? error.message : String(error)}`)
  }
}
