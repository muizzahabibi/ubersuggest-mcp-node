import type { LockStore } from '../stores/lockStore.js'

export class InMemoryLockStore implements LockStore {
  private readonly locks = new Map<string, { owner: string; expiresAt: number }>()

  async acquire(sessionId: string, owner: string, expiresAt: number): Promise<boolean> {
    const current = this.locks.get(sessionId)
    const now = Date.now()
    if (current && current.expiresAt > now && current.owner !== owner) {
      return false
    }
    this.locks.set(sessionId, { owner, expiresAt })
    return true
  }

  async release(sessionId: string, owner: string): Promise<void> {
    const current = this.locks.get(sessionId)
    if (current?.owner === owner) {
      this.locks.delete(sessionId)
    }
  }
}
