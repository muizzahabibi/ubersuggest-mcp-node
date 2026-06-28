export interface LockStore {
  acquire(sessionId: string, owner: string, expiresAt: number): Promise<boolean>
  release(sessionId: string, owner: string): Promise<void>
}
