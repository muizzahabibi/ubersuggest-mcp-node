import type { RateLimitState, SessionMetadata, FeatureName } from '../../domain/types/session.js'
import type { SessionStore } from '../../stores/sessionStore.js'

export class D1SessionStore implements SessionStore {
  constructor(private readonly db: D1Database) {}

  async getSession(sessionId: string): Promise<SessionMetadata | undefined> {
    const row = await this.db.prepare(`
      SELECT session_id, subject, owner_type, created_at, updated_at, status, auth_bundle_secret_id,
             captured_at, last_validated_at, default_project_id, default_workspace_id,
             bootstrap_user_path, bootstrap_get_token_path, last_referer_by_feature_json,
             last_rate_limit_state_json, error_message
      FROM sessions
      WHERE session_id = ?
    `).bind(sessionId).first<Record<string, unknown>>()

    return row ? mapSession(row) : undefined
  }

  async putSession(session: SessionMetadata): Promise<void> {
    await this.db.prepare(`
      INSERT OR REPLACE INTO sessions (
        session_id, subject, owner_type, created_at, updated_at, status, auth_bundle_secret_id,
        captured_at, last_validated_at, default_project_id, default_workspace_id,
        bootstrap_user_path, bootstrap_get_token_path, last_referer_by_feature_json,
        last_rate_limit_state_json, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      session.sessionId,
      session.subject ?? null,
      session.ownerType ?? null,
      session.createdAt ?? Date.now(),
      session.updatedAt ?? Date.now(),
      session.status,
      session.authBundleSecretId ?? null,
      session.capturedAt ?? null,
      session.lastValidatedAt ?? null,
      session.defaultProjectId ?? null,
      session.defaultWorkspaceId ?? null,
      session.bootstrapUserPath ?? null,
      session.bootstrapGetTokenPath ?? null,
      JSON.stringify(session.lastRefererByFeature ?? {}),
      session.lastRateLimitState ? JSON.stringify(session.lastRateLimitState) : null,
      session.errorMessage ?? null,
    ).run()
  }

  async touchSession(sessionId: string, updates: {
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
  }): Promise<SessionMetadata> {
    const existing = (await this.getSession(sessionId)) ?? {
      sessionId,
      status: 'reconnect_required' as const,
      lastRefererByFeature: {},
      createdAt: updates.createdAt ?? Date.now(),
      updatedAt: updates.updatedAt ?? Date.now(),
    }

    const next: SessionMetadata = {
      ...existing,
      ...updates,
      sessionId,
      updatedAt: updates.updatedAt ?? Date.now(),
      lastRefererByFeature: existing.lastRefererByFeature ?? {},
      lastRateLimitState: existing.lastRateLimitState,
    }
    await this.putSession(next)
    return next
  }

  async resetAuth(sessionId: string, updates: { updatedAt: number; status: SessionMetadata['status']; errorMessage?: string }): Promise<SessionMetadata> {
    const existing = await this.getSession(sessionId)
    if (!existing) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const next: SessionMetadata = {
      ...existing,
      updatedAt: updates.updatedAt,
      status: updates.status,
      errorMessage: updates.errorMessage,
      authBundleSecretId: undefined,
      capturedAt: undefined,
      lastValidatedAt: undefined,
      defaultProjectId: undefined,
      defaultWorkspaceId: undefined,
      bootstrapUserPath: undefined,
      bootstrapGetTokenPath: undefined,
    }

    await this.putSession(next)
    return next
  }

  async updateReferer(sessionId: string, feature: FeatureName, referer: string): Promise<void> {
    const existing = await this.getSession(sessionId)
    if (!existing) {
      return
    }
    existing.lastRefererByFeature = {
      ...(existing.lastRefererByFeature ?? {}),
      [feature]: referer,
    }
    existing.updatedAt = Date.now()
    await this.putSession(existing)
  }

  async updateRateLimitState(sessionId: string, state: RateLimitState | undefined): Promise<void> {
    const existing = await this.getSession(sessionId)
    if (!existing) {
      return
    }
    existing.lastRateLimitState = state
    existing.updatedAt = Date.now()
    await this.putSession(existing)
  }
}

function mapSession(row: Record<string, unknown>): SessionMetadata {
  return {
    sessionId: String(row.session_id),
    subject: row.subject ? String(row.subject) : undefined,
    ownerType: row.owner_type === 'user' ? 'user' : undefined,
    createdAt: toNumber(row.created_at),
    updatedAt: toNumber(row.updated_at),
    status: String(row.status) as SessionMetadata['status'],
    authBundleSecretId: row.auth_bundle_secret_id ? String(row.auth_bundle_secret_id) : undefined,
    capturedAt: toNumber(row.captured_at),
    lastValidatedAt: toNumber(row.last_validated_at),
    defaultProjectId: row.default_project_id ? String(row.default_project_id) : undefined,
    defaultWorkspaceId: row.default_workspace_id ? String(row.default_workspace_id) : undefined,
    bootstrapUserPath: row.bootstrap_user_path ? String(row.bootstrap_user_path) : undefined,
    bootstrapGetTokenPath: row.bootstrap_get_token_path ? String(row.bootstrap_get_token_path) : undefined,
    lastRefererByFeature: parseJson(row.last_referer_by_feature_json, {}),
    lastRateLimitState: parseJson(row.last_rate_limit_state_json, undefined),
    errorMessage: row.error_message ? String(row.error_message) : undefined,
  }
}

function toNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : undefined
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) {
    return fallback
  }
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
