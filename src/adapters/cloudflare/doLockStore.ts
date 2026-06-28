import type { LockStore } from '../../stores/lockStore.js'
import type { CloudflareBindings } from '../../config/loadConfig.js'

export class DurableObjectLockStore implements LockStore {
  constructor(private readonly namespace: CloudflareBindings['SESSION_COORDINATOR']) {}

  async acquire(sessionId: string, owner: string, expiresAt: number): Promise<boolean> {
    const stub = this.namespace.getByName(sessionId)
    const response = await stub.fetch('https://session-coordinator/acquire', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner, expiresAt }),
    })

    const data = await response.json<{ ok: boolean }>()
    return Boolean(data.ok)
  }

  async release(sessionId: string, owner: string): Promise<void> {
    const stub = this.namespace.getByName(sessionId)
    await stub.fetch('https://session-coordinator/release', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner }),
    })
  }
}
