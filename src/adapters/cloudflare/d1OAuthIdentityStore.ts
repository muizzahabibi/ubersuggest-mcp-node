import type {
  McpBearerTokenRecord,
  OAuthAuthorizeRequestRecord,
  OAuthConnectCodeRecord,
  OAuthIdentityStore,
  OAuthInviteRecord,
  OAuthManageCodeRecord,
  RuntimeOAuthUserRecord,
} from '../../stores/oauthIdentityStore.js'

export class D1OAuthIdentityStore implements OAuthIdentityStore {
  constructor(private readonly db: D1Database) {}

  async getUser(username: string): Promise<RuntimeOAuthUserRecord | undefined> {
    const row = await this.db.prepare(`
      SELECT username, password_hash, password_salt, created_at, updated_at, created_by, status
      FROM oauth_runtime_users
      WHERE username = ?
    `).bind(username).first<Record<string, unknown>>()

    return row ? {
      username: String(row.username),
      passwordHash: String(row.password_hash),
      passwordSalt: String(row.password_salt),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      createdBy: String(row.created_by),
      status: 'active',
    } : undefined
  }

  async getInviteByCodeHash(codeHash: string): Promise<OAuthInviteRecord | undefined> {
    const row = await this.db.prepare(`
      SELECT code_hash, username, created_at, expires_at, created_by, status, redeemed_at
      FROM oauth_invites
      WHERE code_hash = ?
    `).bind(codeHash).first<Record<string, unknown>>()
    return row ? mapInvite(row) : undefined
  }

  async createInvite(invite: OAuthInviteRecord): Promise<void> {
    await this.db.prepare(`
      INSERT OR REPLACE INTO oauth_invites (code_hash, username, created_at, expires_at, created_by, status, redeemed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(invite.codeHash, invite.username, invite.createdAt, invite.expiresAt, invite.createdBy, invite.status, invite.redeemedAt ?? null).run()
  }

  async redeemInvite(invite: OAuthInviteRecord, user: RuntimeOAuthUserRecord, redeemedAt: number): Promise<void> {
    await this.db.batch([
      this.db.prepare(`
        INSERT OR REPLACE INTO oauth_runtime_users (username, password_hash, password_salt, created_at, updated_at, created_by, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(user.username, user.passwordHash, user.passwordSalt, user.createdAt, user.updatedAt, user.createdBy, user.status),
      this.db.prepare('UPDATE oauth_invites SET status = ?, redeemed_at = ? WHERE code_hash = ?').bind('redeemed', redeemedAt, invite.codeHash),
    ])
  }

  async getAuthorizeRequestByCodeHash(codeHash: string): Promise<OAuthAuthorizeRequestRecord | undefined> {
    const row = await this.db.prepare(`
      SELECT code_hash, auth_request_json, created_at, expires_at, status, consumed_at
      FROM oauth_authorize_requests
      WHERE code_hash = ?
    `).bind(codeHash).first<Record<string, unknown>>()
    return row ? mapAuthorizeRequest(row) : undefined
  }

  async createAuthorizeRequest(authorizeRequest: OAuthAuthorizeRequestRecord): Promise<void> {
    await this.db.prepare(`
      INSERT OR REPLACE INTO oauth_authorize_requests (code_hash, auth_request_json, created_at, expires_at, status, consumed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      authorizeRequest.codeHash,
      JSON.stringify(authorizeRequest.authRequest),
      authorizeRequest.createdAt,
      authorizeRequest.expiresAt,
      authorizeRequest.status,
      authorizeRequest.consumedAt ?? null,
    ).run()
  }

  async consumeAuthorizeRequest(authorizeRequest: OAuthAuthorizeRequestRecord, consumedAt: number): Promise<void> {
    await this.db.prepare('UPDATE oauth_authorize_requests SET status = ?, consumed_at = ? WHERE code_hash = ?').bind('consumed', consumedAt, authorizeRequest.codeHash).run()
  }

  async getConnectCodeByCodeHash(codeHash: string): Promise<OAuthConnectCodeRecord | undefined> {
    const row = await this.db.prepare(`
      SELECT code_hash, subject, username, created_at, expires_at, status, consumed_at
      FROM oauth_connect_codes
      WHERE code_hash = ?
    `).bind(codeHash).first<Record<string, unknown>>()
    return row ? mapConnectCode(row) : undefined
  }

  async createConnectCode(connectCode: OAuthConnectCodeRecord): Promise<void> {
    await this.db.prepare(`
      INSERT OR REPLACE INTO oauth_connect_codes (code_hash, subject, username, created_at, expires_at, status, consumed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(connectCode.codeHash, connectCode.subject, connectCode.username, connectCode.createdAt, connectCode.expiresAt, connectCode.status, connectCode.consumedAt ?? null).run()
  }

  async consumeConnectCode(connectCode: OAuthConnectCodeRecord, consumedAt: number): Promise<void> {
    await this.db.prepare('UPDATE oauth_connect_codes SET status = ?, consumed_at = ? WHERE code_hash = ?').bind('consumed', consumedAt, connectCode.codeHash).run()
  }

  async getMcpBearerTokenByHash(tokenHash: string): Promise<McpBearerTokenRecord | undefined> {
    const row = await this.db.prepare(`
      SELECT token_id, token_hash, subject, username, label, created_at, last_used_at, expires_at, revoked_at, created_by, status
      FROM mcp_bearer_tokens
      WHERE token_hash = ?
    `).bind(tokenHash).first<Record<string, unknown>>()
    return row ? mapMcpBearerToken(row) : undefined
  }

  async listMcpBearerTokens(subject: string): Promise<McpBearerTokenRecord[]> {
    const result = await this.db.prepare(`
      SELECT token_id, token_hash, subject, username, label, created_at, last_used_at, expires_at, revoked_at, created_by, status
      FROM mcp_bearer_tokens
      WHERE subject = ?
      ORDER BY created_at DESC
    `).bind(subject).all<Record<string, unknown>>()
    return (result.results ?? []).map(mapMcpBearerToken)
  }

  async createMcpBearerToken(token: McpBearerTokenRecord): Promise<void> {
    await this.db.prepare(`
      INSERT OR REPLACE INTO mcp_bearer_tokens (token_id, token_hash, subject, username, label, created_at, last_used_at, expires_at, revoked_at, created_by, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      token.tokenId,
      token.tokenHash,
      token.subject,
      token.username,
      token.label ?? null,
      token.createdAt,
      token.lastUsedAt ?? null,
      token.expiresAt ?? null,
      token.revokedAt ?? null,
      token.createdBy,
      token.status,
    ).run()
  }

  async touchMcpBearerToken(tokenId: string, lastUsedAt: number): Promise<void> {
    await this.db.prepare('UPDATE mcp_bearer_tokens SET last_used_at = ? WHERE token_id = ?').bind(lastUsedAt, tokenId).run()
  }

  async revokeMcpBearerToken(tokenId: string, revokedAt: number): Promise<void> {
    await this.db.prepare('UPDATE mcp_bearer_tokens SET status = ?, revoked_at = ? WHERE token_id = ?').bind('revoked', revokedAt, tokenId).run()
  }

  async getManageCodeByCodeHash(codeHash: string): Promise<OAuthManageCodeRecord | undefined> {
    const row = await this.db.prepare(`
      SELECT code_hash, subject, username, created_at, expires_at, status, revoked_at
      FROM oauth_manage_codes
      WHERE code_hash = ?
    `).bind(codeHash).first<Record<string, unknown>>()
    return row ? mapManageCode(row) : undefined
  }

  async createManageCode(manageCode: OAuthManageCodeRecord): Promise<void> {
    await this.db.prepare(`
      INSERT OR REPLACE INTO oauth_manage_codes (code_hash, subject, username, created_at, expires_at, status, revoked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      manageCode.codeHash,
      manageCode.subject,
      manageCode.username,
      manageCode.createdAt,
      manageCode.expiresAt,
      manageCode.status,
      manageCode.revokedAt ?? null,
    ).run()
  }
}

function mapInvite(row: Record<string, unknown>): OAuthInviteRecord {
  return {
    codeHash: String(row.code_hash),
    username: String(row.username),
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    createdBy: String(row.created_by),
    status: String(row.status) as OAuthInviteRecord['status'],
    redeemedAt: row.redeemed_at == null ? undefined : Number(row.redeemed_at),
  }
}

function mapAuthorizeRequest(row: Record<string, unknown>): OAuthAuthorizeRequestRecord {
  return {
    codeHash: String(row.code_hash),
    authRequest: JSON.parse(String(row.auth_request_json)),
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    status: String(row.status) as OAuthAuthorizeRequestRecord['status'],
    consumedAt: row.consumed_at == null ? undefined : Number(row.consumed_at),
  }
}

function mapConnectCode(row: Record<string, unknown>): OAuthConnectCodeRecord {
  return {
    codeHash: String(row.code_hash),
    subject: String(row.subject),
    username: String(row.username),
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    status: String(row.status) as OAuthConnectCodeRecord['status'],
    consumedAt: row.consumed_at == null ? undefined : Number(row.consumed_at),
  }
}

function mapMcpBearerToken(row: Record<string, unknown>): McpBearerTokenRecord {
  return {
    tokenId: String(row.token_id),
    tokenHash: String(row.token_hash),
    subject: String(row.subject),
    username: String(row.username),
    label: row.label == null ? undefined : String(row.label),
    createdAt: Number(row.created_at),
    lastUsedAt: row.last_used_at == null ? undefined : Number(row.last_used_at),
    expiresAt: row.expires_at == null ? undefined : Number(row.expires_at),
    revokedAt: row.revoked_at == null ? undefined : Number(row.revoked_at),
    createdBy: String(row.created_by),
    status: String(row.status) as McpBearerTokenRecord['status'],
  }
}

function mapManageCode(row: Record<string, unknown>): OAuthManageCodeRecord {
  return {
    codeHash: String(row.code_hash),
    subject: String(row.subject),
    username: String(row.username),
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    status: String(row.status) as OAuthManageCodeRecord['status'],
    revokedAt: row.revoked_at == null ? undefined : Number(row.revoked_at),
  }
}
