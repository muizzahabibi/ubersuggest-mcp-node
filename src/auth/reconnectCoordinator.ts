import type { BrowserBootstrapInput, FeatureName, ReconnectJobRecord, ReconnectWorkerPayload, SessionMetadata } from '../domain/types/session.js'
import type { AuthBundleStore } from '../stores/authBundleStore.js'
import type { LockStore } from '../stores/lockStore.js'
import type { ReconnectJobStore } from '../stores/reconnectJobStore.js'
import type { SessionStore } from '../stores/sessionStore.js'
import type { UbersuggestAwsConfig } from '../config/loadConfig.js'
import { generateId } from '../utils/id.js'
import { SessionLockError, SessionOwnershipError } from '../utils/errors.js'
import type { Logger } from '../utils/logging.js'
import { getSubjectFromSessionId } from './principal.js'
import type { ReconnectQueue } from './reconnectQueue.js'
import type { AwsBootstrapBridge } from '../adapters/cloudflare/awsBootstrapBridge.js'

export class ReconnectCoordinator {
  constructor(
    private readonly config: UbersuggestAwsConfig,
    private readonly sessionStore: SessionStore,
    private readonly jobStore: ReconnectJobStore,
    private readonly lockStore: LockStore,
    private readonly authBundleStore: AuthBundleStore,
    private readonly reconnectQueue: ReconnectQueue,
    private readonly bootstrapWorker: AwsBootstrapBridge,
    private readonly logger: Logger,
  ) {}

  async startManualReconnect(subject: string, sessionId: string, input: BrowserBootstrapInput): Promise<ReconnectJobRecord> {
    const jobId = generateId()
    const now = Date.now()
    const lockAcquired = await this.lockStore.acquire(sessionId, jobId, now + this.config.lockTimeoutMs)
    if (!lockAcquired) {
      throw new SessionLockError(`A reconnect job is already in flight for session ${sessionId}`)
    }

    await this.ensureSession(subject, sessionId)

    const job = this.createQueuedJob(jobId, subject, sessionId, now)
    await this.jobStore.createJob(job)
    await this.sessionStore.touchSession(sessionId, {
      subject,
      ownerType: 'user',
      createdAt: now,
      updatedAt: now,
      status: 'refreshing',
      errorMessage: undefined,
    })

    const payload: ReconnectWorkerPayload = {
      jobId,
      sessionId,
      subject,
      input,
      requestedAt: now,
    }

    try {
      await this.reconnectQueue.enqueue(payload)
      return (await this.jobStore.getJob(jobId)) ?? job
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.failReconnect(sessionId, jobId, message)
      throw error
    }
  }

  async markReconnectRequired(sessionId: string, reason: string): Promise<void> {
    const subject = getSubjectFromSessionId(sessionId)
    await this.ensureSession(subject, sessionId)
    await this.sessionStore.touchSession(sessionId, {
      subject,
      ownerType: 'user',
      updatedAt: Date.now(),
      status: 'reconnect_required',
      errorMessage: reason,
    })
  }

  async refreshFromStoredBootstrap(subject: string, sessionId: string, feature: FeatureName = 'bootstrap'): Promise<SessionMetadata> {
    await this.ensureSession(subject, sessionId)
    const existing = await this.sessionStore.getSession(sessionId)
    if (!existing?.authBundleSecretId) {
      throw new SessionOwnershipError('Session requires reconnect.')
    }
    if (existing.subject && existing.subject !== subject) {
      throw new SessionOwnershipError('Session belongs to a different user')
    }

    const bootstrapInput = await this.authBundleStore.getBootstrapInput(existing.authBundleSecretId)
    if (!bootstrapInput) {
      throw new SessionOwnershipError('Stored bootstrap input was not found. Reconnect with cookies or profile again.')
    }

    const lockOwner = `auto-refresh:${Date.now()}`
    const lockAcquired = await this.lockStore.acquire(sessionId, lockOwner, Date.now() + this.config.lockTimeoutMs)
    if (!lockAcquired) {
      throw new SessionLockError(`A reconnect job is already in flight for session ${sessionId}`)
    }

    try {
      const result = await this.bootstrapWorker.bootstrap(bootstrapInput, feature)
      await this.authBundleStore.putAuthBundle(existing.authBundleSecretId, {
        cookiesHeader: result.cookiesHeader,
        authorizationBearer: result.authorizationBearer,
        xUbsData: result.xUbsData,
      }, bootstrapInput)

      return await this.sessionStore.touchSession(sessionId, {
        subject,
        ownerType: 'user',
        updatedAt: Date.now(),
        status: 'ready',
        authBundleSecretId: existing.authBundleSecretId,
        capturedAt: result.capturedAt,
        lastValidatedAt: result.lastValidatedAt,
        defaultProjectId: result.defaultProjectId,
        defaultWorkspaceId: result.defaultWorkspaceId,
        bootstrapUserPath: result.bootstrapUserPath,
        bootstrapGetTokenPath: result.bootstrapGetTokenPath,
        errorMessage: undefined,
      })
    } finally {
      await this.lockStore.release(sessionId, lockOwner)
    }
  }

  async resetSession(subject: string, sessionId: string): Promise<SessionMetadata> {
    await this.ensureSession(subject, sessionId)
    const existing = await this.sessionStore.getSession(sessionId)
    if (!existing) {
      throw new SessionOwnershipError('Session belongs to a different user')
    }
    if (existing.subject && existing.subject !== subject) {
      throw new SessionOwnershipError('Session belongs to a different user')
    }

    if (existing.authBundleSecretId) {
      await this.authBundleStore.deleteAuthBundle(existing.authBundleSecretId)
    }

    return this.sessionStore.resetAuth(sessionId, {
      updatedAt: Date.now(),
      status: 'reconnect_required',
      errorMessage: 'Stored auth session reset by user.',
    })
  }

  async getJob(jobId: string, subject?: string): Promise<ReconnectJobRecord | undefined> {
    const job = await this.jobStore.getJob(jobId)
    if (!job) {
      return undefined
    }
    if (subject && job.subject !== subject) {
      return undefined
    }
    return job
  }

  async processReconnectJob(payload: ReconnectWorkerPayload): Promise<ReconnectJobRecord> {
    await this.jobStore.updateJob(payload.jobId, {
      status: 'running',
      updatedAt: Date.now(),
    })

    try {
      const result = await this.bootstrapWorker.bootstrap(payload.input)
      const secretId = this.buildAuthBundleSecretId(payload.subject)

      await this.authBundleStore.putAuthBundle(secretId, {
        cookiesHeader: result.cookiesHeader,
        authorizationBearer: result.authorizationBearer,
        xUbsData: result.xUbsData,
      }, payload.input)
      await this.sessionStore.touchSession(payload.sessionId, {
        subject: payload.subject,
        ownerType: 'user',
        updatedAt: Date.now(),
        status: 'ready',
        authBundleSecretId: secretId,
        capturedAt: result.capturedAt,
        lastValidatedAt: result.lastValidatedAt,
        defaultProjectId: result.defaultProjectId,
        defaultWorkspaceId: result.defaultWorkspaceId,
        bootstrapUserPath: result.bootstrapUserPath,
        bootstrapGetTokenPath: result.bootstrapGetTokenPath,
        errorMessage: undefined,
      })
      await this.lockStore.release(payload.sessionId, payload.jobId)
      return this.jobStore.updateJob(payload.jobId, {
        status: 'succeeded',
        updatedAt: Date.now(),
        errorMessage: undefined,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error('Reconnect worker failed', {
        sessionId: payload.sessionId,
        jobId: payload.jobId,
        error: message,
      })
      return this.failReconnect(payload.sessionId, payload.jobId, message)
    }
  }

  private buildAuthBundleSecretId(subject: string): string {
    return `${this.config.authSecretPrefix}/users/${subject}`
  }

  private createQueuedJob(jobId: string, subject: string, sessionId: string, now: number): ReconnectJobRecord {
    return {
      jobId,
      sessionId,
      subject,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    }
  }

  private async failReconnect(sessionId: string, jobId: string, message: string): Promise<ReconnectJobRecord> {
    await this.sessionStore.touchSession(sessionId, {
      updatedAt: Date.now(),
      status: 'error',
      errorMessage: message,
    })
    await this.lockStore.release(sessionId, jobId)
    return this.jobStore.updateJob(jobId, {
      status: 'failed',
      updatedAt: Date.now(),
      errorMessage: message,
    })
  }

  private async ensureSession(subject: string, sessionId: string): Promise<void> {
    const existing = await this.sessionStore.getSession(sessionId)
    if (existing) {
      if (existing.subject && existing.subject !== subject) {
        this.logger.error('Session ownership mismatch during reconnect', {
          sessionId,
          expectedSubject: subject,
          actualSubject: existing.subject,
        })
        throw new SessionOwnershipError('Session belongs to a different user')
      }
      return
    }

    const now = Date.now()
    await this.sessionStore.putSession({
      sessionId,
      subject,
      ownerType: 'user',
      createdAt: now,
      updatedAt: now,
      status: 'reconnect_required',
      lastRefererByFeature: {},
    })
  }
}
