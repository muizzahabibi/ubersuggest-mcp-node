import type { AuthenticatedPrincipal } from '../domain/types/oauth.js'
import type { BrowserBootstrapInput } from '../domain/types/session.js'
import { Logger } from '../utils/logging.js'
import { loadConfig, type CloudflareBindings, type UbersuggestAwsConfig } from '../config/loadConfig.js'
import { buildUserSessionId } from '../auth/principal.js'
import { SessionResolver } from '../auth/sessionResolver.js'
import { ReconnectCoordinator } from '../auth/reconnectCoordinator.js'
import { UbersuggestClient } from '../client/ubersuggestClient.js'
import { SubscriptionService } from '../domain/services/subscriptionService.js'
import { ProjectsService } from '../domain/services/projectsService.js'
import { DomainService } from '../domain/services/domainService.js'
import { KeywordService } from '../domain/services/keywordService.js'
import { SiteAuditService } from '../domain/services/siteAuditService.js'
import { RawUbersuggestService } from '../domain/services/rawUbersuggestService.js'
import { D1SessionStore } from '../adapters/cloudflare/d1SessionStore.js'
import { D1ReconnectJobStore } from '../adapters/cloudflare/d1ReconnectJobStore.js'
import { D1AuthBundleStore } from '../adapters/cloudflare/d1AuthBundleStore.js'
import { DurableObjectLockStore } from '../adapters/cloudflare/doLockStore.js'
import { AwsBootstrapBridge } from '../adapters/cloudflare/awsBootstrapBridge.js'
import { D1AuthorizationCodeStore } from '../adapters/cloudflare/d1AuthorizationCodeStore.js'
import { D1OAuthIdentityStore } from '../adapters/cloudflare/d1OAuthIdentityStore.js'
import { OAuthIdentityService } from '../auth/oauthIdentityService.js'
import type { AuthorizationCodeStore } from '../stores/authorizationCodeStore.js'
import type { ReconnectQueue } from '../auth/reconnectQueue.js'

export interface ToolContext {
  principal: AuthenticatedPrincipal
  sessionId: string
  logger: Logger
  reconnectCoordinator: ReconnectCoordinator
  oauthIdentityService: OAuthIdentityService
  services: {
    subscription: SubscriptionService
    projects: ProjectsService
    domain: DomainService
    keyword: KeywordService
    siteAudit: SiteAuditService
    raw: RawUbersuggestService
  }
}

export interface AppContainer {
  config: UbersuggestAwsConfig
  logger: Logger
  reconnectCoordinator: ReconnectCoordinator
  authorizationCodeStore: AuthorizationCodeStore
  oauthIdentityService: OAuthIdentityService
  createToolContext(principal: AuthenticatedPrincipal): ToolContext
}

class InlineReconnectQueue implements ReconnectQueue {
  constructor(private readonly coordinatorFactory: () => ReconnectCoordinator) {}

  async enqueue(payload: { jobId: string; sessionId: string; subject: string; input: BrowserBootstrapInput; requestedAt: number }): Promise<void> {
    await this.coordinatorFactory().processReconnectJob(payload)
  }
}

export function createContainer(env: CloudflareBindings): AppContainer {
  const config = loadConfig(env)
  const logger = new Logger(config.logLevel)
  const sessionStore = new D1SessionStore(config.db)
  const jobStore = new D1ReconnectJobStore(config.db)
  const authBundleStore = new D1AuthBundleStore(config.db, config.authEncryptionKey)
  const authorizationCodeStore = new D1AuthorizationCodeStore(config.db)
  const oauthIdentityStore = new D1OAuthIdentityStore(config.db)
  const oauthIdentityService = new OAuthIdentityService(config, oauthIdentityStore)
  const lockStore = new DurableObjectLockStore(config.sessionCoordinator)
  const bootstrapWorker = new AwsBootstrapBridge(config)

  let reconnectCoordinator!: ReconnectCoordinator
  const reconnectQueue = new InlineReconnectQueue(() => reconnectCoordinator)

  reconnectCoordinator = new ReconnectCoordinator(
    config,
    sessionStore,
    jobStore,
    lockStore,
    authBundleStore,
    reconnectQueue,
    bootstrapWorker as any,
    logger,
  )

  return {
    config,
    logger,
    reconnectCoordinator,
    authorizationCodeStore,
    oauthIdentityService,
    createToolContext(principal: AuthenticatedPrincipal): ToolContext {
      const sessionId = buildUserSessionId(principal.subject)
      const sessionResolver = new SessionResolver(config, sessionStore, authBundleStore, reconnectCoordinator, logger)
      const client = new UbersuggestClient(config, sessionId, sessionResolver, reconnectCoordinator, logger)

      return {
        principal,
        sessionId,
        logger,
        reconnectCoordinator,
        oauthIdentityService,
        services: {
          subscription: new SubscriptionService(client),
          projects: new ProjectsService(client),
          domain: new DomainService(client, config.topCountriesLangLocs, config.pollIntervalMs, config.pollTimeoutMs),
          keyword: new KeywordService(client, config.pollIntervalMs, config.pollTimeoutMs),
          siteAudit: new SiteAuditService(client, logger, config.db),
          raw: new RawUbersuggestService(client),
        },
      }
    },
  }
}
