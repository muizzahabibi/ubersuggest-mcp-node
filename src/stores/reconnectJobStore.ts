import type { ReconnectJobRecord } from '../domain/types/session.js'

export interface ReconnectJobStore {
  createJob(job: ReconnectJobRecord): Promise<void>
  getJob(jobId: string): Promise<ReconnectJobRecord | undefined>
  updateJob(jobId: string, updates: Partial<ReconnectJobRecord>): Promise<ReconnectJobRecord>
}
