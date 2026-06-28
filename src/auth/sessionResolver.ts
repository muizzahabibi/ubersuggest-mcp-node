import type { UbersuggestAwsConfig } from '../config/loadConfig.js'
import type { FeatureName, RuntimeSession, SessionMetadata } from '../domain/types/session.js'
import type { AuthBundleStore } from '../stores/authBundleStore.js'
import type { SessionStore } from '../stores/sessionStore.js'
import { AuthBootstrapError, ReconnectRequiredError, ResponseValidationError, SessionLockError, SessionOwnershipError } from '../utils/errors.js'
import type { Logger } from '../utils/logging.js'
import { BootstrapValidator } from './bootstrapValidator.js'
import { ReconnectCoordinator } from './reconnectCoordinator.js'

export class SessionResolver {
  private readonly validator: BootstrapValidator

  constructor(
    private readonly config: UbersuggestAwsConfig,
    private readonly sessionStore: SessionStore,
    private readonly authBundleStore: AuthBundleStore,
    private readonly reconnectCoordinator: ReconnectCoordinator,
    private readonly logger: Logger,
  ) {
    this.validator = new BootstrapValidator(config)
  }

  async getValidSession(sessionId: string, feature: FeatureName = 'bootstrap'): Promise<RuntimeSession> {
    const metadata = await this.sessionStore.getSession(sessionId)
    if (!metadata) {
      throw new ReconnectRequiredError('No stored session metadata. Run reconnect first.', sessionId)
    }

    const expectedSubject = sessionId.startsWith('user:') ? sessionId.slice('user:'.length) : sessionId
    if (metadata.subject && metadata.subject !== expectedSubject) {
      this.logger.error('Stored session subject mismatch', {
        sessionId,
        expectedSubject,
        actualSubject: metadata.subject,
      })
      throw new SessionOwnershipError('Stored session belongs to a different user')
    }
    if (metadata.ownerType && metadata.ownerType !== 'user') {
      this.logger.error('Stored session owner type mismatch', {
        sessionId,
        ownerType: metadata.ownerType,
      })
      throw new SessionOwnershipError('Stored session owner type is invalid')
    }

    if (metadata.status !== 'ready') {
      throw new ReconnectRequiredError(this.messageForStatus(metadata), sessionId)
    }

    if (!metadata.authBundleSecretId) {
      throw new ReconnectRequiredError('No stored auth bundle. Run reconnect first.', sessionId)
    }

    const authBundle = await this.authBundleStore.getAuthBundle(metadata.authBundleSecretId)
    if (!authBundle) {
      throw new ReconnectRequiredError('Stored auth bundle was not found. Run reconnect first.', sessionId)
    }

    const session = toRuntimeSession(sessionId, metadata, authBundle)

    if (this.shouldSoftRefresh(session, feature)) {
      return this.revalidateSession(sessionId, session, feature)
    }

    return session
  }

  updateRateLimitState(sessionId: string, state: RuntimeSession['lastRateLimitState']): Promise<void> {
    return this.sessionStore.updateRateLimitState(sessionId, state)
  }

  updateReferer(sessionId: string, feature: FeatureName, referer: string): Promise<void> {
    return this.sessionStore.updateReferer(sessionId, feature, referer)
  }

  async revalidateSession(sessionId: string, session: RuntimeSession, feature: FeatureName = 'bootstrap'): Promise<RuntimeSession> {
    try {
      const refreshed = await this.validator.validate(session)
      const updated = await this.sessionStore.touchSession(sessionId, {
        status: 'ready',
        capturedAt: refreshed.capturedAt,
        lastValidatedAt: refreshed.lastValidatedAt,
        defaultProjectId: refreshed.defaultProjectId,
        defaultWorkspaceId: refreshed.defaultWorkspaceId,
        bootstrapUserPath: refreshed.bootstrapUserPath,
        bootstrapGetTokenPath: refreshed.bootstrapGetTokenPath,
        errorMessage: undefined,
      })
      return {
        ...session,
        lastValidatedAt: updated.lastValidatedAt ?? refreshed.lastValidatedAt,
        defaultProjectId: updated.defaultProjectId ?? refreshed.defaultProjectId,
        defaultWorkspaceId: updated.defaultWorkspaceId ?? refreshed.defaultWorkspaceId,
        bootstrapUserPath: updated.bootstrapUserPath ?? refreshed.bootstrapUserPath,
        bootstrapGetTokenPath: updated.bootstrapGetTokenPath ?? refreshed.bootstrapGetTokenPath,
      }
    } catch (error) {
      if (error instanceof AuthBootstrapError || error instanceof ResponseValidationError) {
        this.logger.warn('Stored auth bundle failed revalidation; attempting browser bootstrap from stored input', {
          sessionId,
          feature,
          error: error.message,
        })
        this.logger.diagnosticEvent(this.config.diagnosticLogging, 'Stored auth bundle failed revalidation', {
          sessionId,
          feature,
          error: error.message,
        })

        const subject = sessionId.startsWith('user:') ? sessionId.slice('user:'.length) : sessionId

        try {
          const refreshedMetadata = await this.reconnectCoordinator.refreshFromStoredBootstrap(subject, sessionId, feature)
          const refreshedAuthBundleSecretId = refreshedMetadata.authBundleSecretId
            ?? (await this.sessionStore.getSession(sessionId))?.authBundleSecretId
          if (!refreshedAuthBundleSecretId) {
            throw new ReconnectRequiredError('Stored auth bundle was not found after refresh. Run reconnect first.', sessionId)
          }

          const refreshedAuthBundle = await this.authBundleStore.getAuthBundle(refreshedAuthBundleSecretId)
          if (!refreshedAuthBundle) {
            throw new ReconnectRequiredError('Stored auth bundle was not found after refresh. Run reconnect first.', sessionId)
          }

          return {
            ...session,
            cookiesHeader: refreshedAuthBundle.cookiesHeader,
            authorizationBearer: refreshedAuthBundle.authorizationBearer,
            xUbsData: refreshedAuthBundle.xUbsData,
            capturedAt: refreshedMetadata.capturedAt ?? session.capturedAt,
            lastValidatedAt: refreshedMetadata.lastValidatedAt ?? session.lastValidatedAt,
            defaultProjectId: refreshedMetadata.defaultProjectId,
            defaultWorkspaceId: refreshedMetadata.defaultWorkspaceId,
            bootstrapUserPath: refreshedMetadata.bootstrapUserPath,
            bootstrapGetTokenPath: refreshedMetadata.bootstrapGetTokenPath,
          }
        } catch (refreshError) {
          if (refreshError instanceof SessionLockError) {
            this.logger.warn('Stored bootstrap refresh already in flight; leaving session state unchanged', {
              sessionId,
              feature,
              error: refreshError.message,
            })
            this.logger.diagnosticEvent(this.config.diagnosticLogging, 'Stored bootstrap refresh already in flight', {
              sessionId,
              feature,
              error: refreshError.message,
            })
            throw refreshError
          }

          this.logger.warn('Stored bootstrap input could not refresh session; reconnect is required', {
            sessionId,
            feature,
            error: refreshError instanceof Error ? refreshError.message : String(refreshError),
          })
          this.logger.diagnosticEvent(this.config.diagnosticLogging, 'Stored bootstrap refresh failed; reconnect required', {
            sessionId,
            feature,
            error: refreshError instanceof Error ? refreshError.message : String(refreshError),
          })
          await this.sessionStore.touchSession(sessionId, {
            status: 'reconnect_required',
            errorMessage: 'Stored Ubersuggest auth bundle and bootstrap input both failed refresh; Ubersuggest reconnect is required.',
          })
          throw new ReconnectRequiredError('Stored Ubersuggest auth bundle and bootstrap input both failed refresh; Ubersuggest reconnect is required.', sessionId)
        }
      }

      this.logger.error('Unexpected stored auth bundle revalidation failure', {
        sessionId,
        feature,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  private shouldSoftRefresh(_session: RuntimeSession, _feature: FeatureName): boolean {
    return false
  }

  private messageForStatus(metadata: SessionMetadata): string {
    switch (metadata.status) {
      case 'refreshing':
        return 'Ubersuggest session is refreshing. Check Ubersuggest reconnect status and retry later.'
      case 'reconnect_required':
        return metadata.errorMessage ?? 'Ubersuggest reconnect is required.'
      case 'error':
        return metadata.errorMessage ?? 'Ubersuggest session is in an error state. Ubersuggest reconnect is required.'
      default:
        return 'Ubersuggest session is not ready.'
    }
  }
}

function toRuntimeSession(sessionId: string, metadata: SessionMetadata, authBundle: { cookiesHeader: string; authorizationBearer: string; xUbsData: string }): RuntimeSession {
  if (!metadata.capturedAt || !metadata.lastValidatedAt) {
    throw new ReconnectRequiredError('Stored session metadata is incomplete. Run reconnect first.', sessionId)
  }

  return {
    sessionId,
    cookiesHeader: authBundle.cookiesHeader,
    authorizationBearer: authBundle.authorizationBearer,
    xUbsData: authBundle.xUbsData,
    capturedAt: metadata.capturedAt,
    lastValidatedAt: metadata.lastValidatedAt,
    defaultProjectId: metadata.defaultProjectId,
    defaultWorkspaceId: metadata.defaultWorkspaceId,
    bootstrapUserPath: metadata.bootstrapUserPath,
    bootstrapGetTokenPath: metadata.bootstrapGetTokenPath,
    lastRefererByFeature: metadata.lastRefererByFeature ?? {},
    lastRateLimitState: metadata.lastRateLimitState,
  }
}
