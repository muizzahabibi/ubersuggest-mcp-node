import type { AuthorizationCodeRecord, AuthorizationCodeStore } from '../../stores/authorizationCodeStore.js'

export class D1AuthorizationCodeStore implements AuthorizationCodeStore {
  constructor(private readonly db: D1Database) {}

  async createCode(record: AuthorizationCodeRecord): Promise<void> {
    await this.db.prepare(`
      INSERT OR REPLACE INTO authorization_codes (code_id, client_id, redirect_uri, subject, expires_at, created_at, consumed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      record.codeId,
      record.clientId,
      record.redirectUri,
      record.subject,
      record.expiresAt,
      record.createdAt,
      record.consumedAt ?? null,
    ).run()
  }

  async consumeCode(codeId: string): Promise<AuthorizationCodeRecord | undefined> {
    const row = await this.db.prepare(`
      SELECT code_id, client_id, redirect_uri, subject, expires_at, created_at, consumed_at
      FROM authorization_codes
      WHERE code_id = ?
    `).bind(codeId).first<Record<string, unknown>>()

    if (!row) {
      return undefined
    }

    const record: AuthorizationCodeRecord = {
      codeId: String(row.code_id),
      clientId: String(row.client_id),
      redirectUri: String(row.redirect_uri),
      subject: String(row.subject),
      expiresAt: Number(row.expires_at),
      createdAt: Number(row.created_at),
      consumedAt: row.consumed_at == null ? undefined : Number(row.consumed_at),
    }

    const consumedAt = Date.now()
    await this.db.prepare('UPDATE authorization_codes SET consumed_at = ? WHERE code_id = ?').bind(consumedAt, codeId).run()
    return { ...record, consumedAt }
  }
}
