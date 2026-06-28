import type { AuthBundle, BrowserBootstrapInput } from '../../domain/types/session.js'
import type { AuthBundleStore } from '../../stores/authBundleStore.js'
import { decryptJson, encryptJson } from './crypto.js'

interface StoredBundlePayload {
  bundle: AuthBundle
  bootstrapInput?: BrowserBootstrapInput
}

export class D1AuthBundleStore implements AuthBundleStore {
  constructor(
    private readonly db: D1Database,
    private readonly encryptionKey: string,
  ) {}

  async getAuthBundle(secretId: string): Promise<AuthBundle | undefined> {
    const payload = await this.getPayload(secretId)
    return payload?.bundle
  }

  async getBootstrapInput(secretId: string): Promise<BrowserBootstrapInput | undefined> {
    const payload = await this.getPayload(secretId)
    return payload?.bootstrapInput
  }

  async putAuthBundle(secretId: string, bundle: AuthBundle, bootstrapInput?: BrowserBootstrapInput): Promise<void> {
    const encrypted = await encryptJson(this.encryptionKey, { bundle, bootstrapInput } satisfies StoredBundlePayload)
    await this.db.prepare(`
      INSERT OR REPLACE INTO auth_bundles (secret_id, encrypted_payload, updated_at)
      VALUES (?, ?, ?)
    `).bind(secretId, encrypted, Date.now()).run()
  }

  async deleteAuthBundle(secretId: string): Promise<void> {
    await this.db.prepare('DELETE FROM auth_bundles WHERE secret_id = ?').bind(secretId).run()
  }

  private async getPayload(secretId: string): Promise<StoredBundlePayload | undefined> {
    const row = await this.db.prepare('SELECT encrypted_payload FROM auth_bundles WHERE secret_id = ?').bind(secretId).first<{ encrypted_payload: string }>()
    if (!row?.encrypted_payload) {
      return undefined
    }
    return decryptJson<StoredBundlePayload>(this.encryptionKey, row.encrypted_payload)
  }
}
