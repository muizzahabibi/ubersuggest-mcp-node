import { UbersuggestClient } from '../../client/ubersuggestClient.js'
import type { SeoOpportunitiesResponse, SiteAuditResponse } from '../types/endpoints.js'
import type { Logger } from '../../utils/logging.js'
import { ApiError } from '../../utils/errors.js'
import { ensureRecord } from '../../utils/validation.js'
import { formatSiteAuditMarkdown } from '../../utils/auditFormatter.js'

const DEFAULT_SITE_AUDIT_DEVICES: Array<'DESKTOP' | 'MOBILE'> = ['DESKTOP', 'MOBILE']

export class SiteAuditService {
  constructor(
    private readonly client: UbersuggestClient,
    private readonly logger: Logger,
    private readonly db?: any,
  ) {}

  async getSeoOpportunities(projectId: string): Promise<SeoOpportunitiesResponse> {
    const response = await this.client.get<Record<string, unknown>>(`/api/projects/${projectId}/seo_opportunities`, {
      feature: 'siteAudit',
    })
    const data = ensureRecord(response.data, 'SEO opportunities response')

    return {
      opportunities_count: toRecord(data.opportunities_count),
      opportunities: toRecordArray(data.opportunities),
      dismissed_opportunities: toRecordArray(data.dismissed_opportunities),
      done_opportunities: toRecordArray(data.done_opportunities),
    }
  }

  async getSiteAudit(input: {
    projectId: string
    domainUrl: string
    forceUpdate?: boolean
    devices?: Array<'DESKTOP' | 'MOBILE'>
    components?: Array<'pagespeed' | 'seo_opportunities' | 'google_services_status'>
  }): Promise<SiteAuditResponse & { markdownSummary?: string }> {
    const devices = input.devices ?? DEFAULT_SITE_AUDIT_DEVICES
    const sortedDevices = [...devices].sort()
    const components = input.components ?? ['pagespeed', 'seo_opportunities', 'google_services_status']
    const cacheKey = `${input.domainUrl}:${sortedDevices.join(',')}`

    // 1. Check cache if db is available and forceUpdate is not set
    if (this.db && input.forceUpdate !== true) {
      try {
        const cached = await this.db.prepare('SELECT pagespeed_json, seo_opportunities_json, google_services_json, cached_at FROM site_audit_cache WHERE cache_key = ?')
          .bind(cacheKey)
          .first();

        if (cached && Date.now() - cached.cached_at < 24 * 3600 * 1000) {
          this.logger.info('Returning cached site audit data', { cacheKey })
          const pagespeed = JSON.parse(cached.pagespeed_json)
          const seoOpportunities = JSON.parse(cached.seo_opportunities_json)
          const googleServicesStatus = cached.google_services_json ? JSON.parse(cached.google_services_json) : undefined

          const markdownSummary = formatSiteAuditMarkdown(input.domainUrl, pagespeed, seoOpportunities, googleServicesStatus)

          return {
            pagespeed,
            seoOpportunities,
            googleServicesStatus,
            markdownSummary
          }
        }
      } catch (error) {
        this.logger.warn('Failed to read from site audit cache', { error: error instanceof Error ? error.message : String(error) })
      }
    }

    // 2. Perform live fetch for only the requested components
    const promises: Array<Promise<any>> = []

    if (components.includes('pagespeed')) {
      promises.push(
        this.client.get<Record<string, unknown>>('/api/pagespeed_audit', {
          feature: 'siteAudit',
          query: {
            domain: input.domainUrl,
            forceUpdate: input.forceUpdate ?? false,
            devices: devices.join(','),
          },
        }).then((res) => ensureRecord(res.data, 'PageSpeed audit response'))
      )
    } else {
      promises.push(Promise.resolve({}))
    }

    if (components.includes('seo_opportunities')) {
      promises.push(this.getSeoOpportunities(input.projectId))
    } else {
      promises.push(Promise.resolve({ opportunities_count: {}, opportunities: [], dismissed_opportunities: [], done_opportunities: [] }))
    }

    if (components.includes('google_services_status')) {
      promises.push(this.getGoogleServicesStatus(input.projectId))
    } else {
      promises.push(Promise.resolve(undefined))
    }

    const [pagespeed, seoOpportunities, googleServicesStatus] = await Promise.all(promises)

    const markdownSummary = formatSiteAuditMarkdown(input.domainUrl, pagespeed, seoOpportunities, googleServicesStatus)

    // 3. Save to cache in the background
    if (this.db) {
      try {
        await this.db.prepare('INSERT OR REPLACE INTO site_audit_cache (cache_key, domain_url, devices, pagespeed_json, seo_opportunities_json, google_services_json, cached_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(
            cacheKey,
            input.domainUrl,
            sortedDevices.join(','),
            JSON.stringify(pagespeed),
            JSON.stringify(seoOpportunities),
            googleServicesStatus ? JSON.stringify(googleServicesStatus) : null,
            Date.now()
          )
          .run()
      } catch (error) {
        this.logger.warn('Failed to write to site audit cache', { error: error instanceof Error ? error.message : String(error) })
      }
    }

    return {
      pagespeed,
      seoOpportunities,
      googleServicesStatus,
      markdownSummary
    }
  }

  private async getGoogleServicesStatus(projectId: string): Promise<Record<string, unknown> | undefined> {
    try {
      const response = await this.client.get<Record<string, unknown>>(`/api/projects/${projectId}/google_services_status`, {
        feature: 'siteAudit',
      })
      return response.data
    } catch (error) {
      if (error instanceof ApiError) {
        this.logger.warn('Optional google_services_status request failed; omitting from site audit', {
          projectId,
          status: error.status,
          error: error.message,
        })
        return undefined
      }

      throw error
    }
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function toRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []
}
