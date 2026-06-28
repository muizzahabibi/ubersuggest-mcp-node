import type { ReconnectWorkerPayload } from '../domain/types/session.js'

export interface ReconnectQueue {
  enqueue(payload: ReconnectWorkerPayload): Promise<void>
}
