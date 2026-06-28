import { FEATURE_REFERERS } from '../client/endpointCatalog.js'
import { buildRequestInit, buildUrl } from '../client/requestPolicy.js'
import type { UbersuggestAwsConfig } from '../config/loadConfig.js'
import type { BrowserBootstrapResult, FeatureName, RuntimeSession } from '../domain/types/session.js'
import { AuthBootstrapError, ResponseValidationError } from '../utils/errors.js'
import { ensureArray, ensureRecord } from '../utils/validation.js'

export class BootstrapValidator {
  constructor(private readonly config: UbersuggestAwsConfig) {}

  buildBootstrapReferers(referer: string | undefined): Partial<Record<FeatureName, string>> {
    return {
      bootstrap: referer ?? new URL(this.config.bootstrapPath, this.config.baseUrl).toString(),
      traffic: new URL(FEATURE_REFERERS.traffic, this.config.baseUrl).toString(),
      keyword: new URL(FEATURE_REFERERS.keyword, this.config.baseUrl).toString(),
      siteAudit: new URL(FEATURE_REFERERS.siteAudit, this.config.baseUrl).toString(),
    }
  }

  async validate(
    session: RuntimeSession,
    observed?: {
      observedUserUrl?: string
      observedGetTokenUrl?: string
    },
  ): Promise<BrowserBootstrapResult> {
    const bootstrapPaths = this.resolveBootstrapPaths(session, observed)

    const userResponse = await this.fetchJson<Record<string, unknown>>(session, bootstrapPaths.userPath, 'bootstrap', true)
    ensureRecord(userResponse, 'Bootstrap user response')

    const tokenResponse = await this.fetchJson<unknown>(session, bootstrapPaths.getTokenPath, 'bootstrap', true)
    if (tokenResponse !== null && typeof tokenResponse !== 'object' && typeof tokenResponse !== 'string') {
      throw new AuthBootstrapError('Bootstrap get_token response had an unexpected primitive shape')
    }

    const subscriptionResponse = await this.fetchJson<Record<string, unknown>>(session, '/api/subscription', 'bootstrap')
    const subscriptionRecord = ensureRecord(subscriptionResponse, 'Bootstrap subscription response')
    this.ensureSubscriptionLooksUsable(subscriptionRecord)

    const projectsResponse = await this.fetchJson<{ projects?: Array<Record<string, unknown>> }>(session, '/api/projects', 'bootstrap')
    const projectsRecord = ensureRecord(projectsResponse, 'Bootstrap projects response')
    const projects = ensureArray(projectsRecord.projects, 'Bootstrap projects response.projects')
    const { defaultProjectId, defaultWorkspaceId } = this.resolveDefaultProjectContext(projects)

    return {
      cookiesHeader: session.cookiesHeader,
      authorizationBearer: session.authorizationBearer,
      xUbsData: session.xUbsData,
      capturedAt: session.capturedAt,
      lastValidatedAt: Date.now(),
      defaultProjectId,
      defaultWorkspaceId,
      bootstrapUserPath: bootstrapPaths.userPath,
      bootstrapGetTokenPath: bootstrapPaths.getTokenPath,
      lastRefererByFeature: session.lastRefererByFeature,
    }
  }

  private resolveBootstrapPaths(
    session: RuntimeSession,
    observed?: {
      observedUserUrl?: string
      observedGetTokenUrl?: string
    },
  ): {
    userPath: string
    getTokenPath: string
  } {
    return {
      userPath: this.resolveBootstrapPath(observed?.observedUserUrl, session.bootstrapUserPath ?? '/api/user'),
      getTokenPath: this.resolveBootstrapPath(observed?.observedGetTokenUrl, session.bootstrapGetTokenPath ?? '/api/get_token'),
    }
  }

  private resolveDefaultProjectContext(projects: Array<Record<string, unknown>>): {
    defaultProjectId?: string
    defaultWorkspaceId?: string
  } {
    const firstProject = projects[0]
    const defaultProjectId = typeof firstProject?.id === 'string' ? firstProject.id : undefined
    const workspaceRecord = firstProject?.workspace as Record<string, unknown> | undefined
    const defaultWorkspaceId = typeof workspaceRecord?.id === 'string' ? workspaceRecord.id : undefined

    return {
      defaultProjectId,
      defaultWorkspaceId,
    }
  }

  private ensureSubscriptionLooksUsable(subscription: Record<string, unknown>): void {
    if (typeof subscription.tier !== 'string' || subscription.tier.length === 0) {
      throw new AuthBootstrapError('Bootstrap subscription response is missing tier')
    }

    if (typeof subscription.planCode !== 'string' || subscription.planCode.length === 0) {
      throw new AuthBootstrapError('Bootstrap subscription response is missing planCode')
    }

    if (typeof subscription.subscriptionStatus !== 'string' || subscription.subscriptionStatus.length === 0) {
      throw new AuthBootstrapError('Bootstrap subscription response is missing subscriptionStatus')
    }
  }

  private resolveBootstrapPath(observedUrl: string | undefined, fallbackPath: string): string {
    if (!observedUrl) {
      return fallbackPath
    }

    const parsed = new URL(observedUrl)
    if (parsed.origin !== this.config.baseUrl) {
      return fallbackPath
    }

    return `${parsed.pathname}${parsed.search}`
  }

  private async fetchJson<T>(session: RuntimeSession, path: string, feature: FeatureName, allowTextBody = false): Promise<T> {
    const response = await fetch(buildUrl(this.config.baseUrl, path), {
      ...buildRequestInit(this.config, session, 'GET', { feature }),
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    })

    if (!response.ok) {
      const body = await safeParseBody(response, allowTextBody)
      throw new AuthBootstrapError(`Bootstrap validation failed for ${path} with status ${response.status}: ${JSON.stringify(body)}`)
    }

    return (await safeParseBody(response, allowTextBody)) as T
  }
}

async function safeParseBody(response: Response, allowTextBody = false): Promise<unknown> {
  const text = await response.text()
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    if (allowTextBody) {
      return text
    }
    throw new ResponseValidationError(`Expected JSON bootstrap response from ${response.url}`)
  }
}
