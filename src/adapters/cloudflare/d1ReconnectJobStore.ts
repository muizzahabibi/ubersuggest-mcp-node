import type { ReconnectJobRecord } from '../../domain/types/session.js'
import type { ReconnectJobStore } from '../../stores/reconnectJobStore.js'

export class D1ReconnectJobStore implements ReconnectJobStore {
  constructor(private readonly db: D1Database) {}

  async createJob(job: ReconnectJobRecord): Promise<void> {
    await this.db.prepare(`
      INSERT OR REPLACE INTO reconnect_jobs (job_id, session_id, subject, status, created_at, updated_at, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      job.jobId,
      job.sessionId,
      job.subject,
      job.status,
      job.createdAt,
      job.updatedAt,
      job.errorMessage ?? null,
    ).run()
  }

  async getJob(jobId: string): Promise<ReconnectJobRecord | undefined> {
    const row = await this.db.prepare(`
      SELECT job_id, session_id, subject, status, created_at, updated_at, error_message
      FROM reconnect_jobs
      WHERE job_id = ?
    `).bind(jobId).first<Record<string, unknown>>()

    return row ? mapJob(row) : undefined
  }

  async updateJob(jobId: string, updates: Partial<ReconnectJobRecord>): Promise<ReconnectJobRecord> {
    const existing = await this.getJob(jobId)
    if (!existing) {
      throw new Error(`Reconnect job ${jobId} not found`)
    }

    const next: ReconnectJobRecord = {
      ...existing,
      ...updates,
      jobId,
    }
    await this.createJob(next)
    return next
  }
}

function mapJob(row: Record<string, unknown>): ReconnectJobRecord {
  return {
    jobId: String(row.job_id),
    sessionId: String(row.session_id),
    subject: String(row.subject),
    status: String(row.status) as ReconnectJobRecord['status'],
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    errorMessage: row.error_message ? String(row.error_message) : undefined,
  }
}
