import { UbersuggestClient } from '../../client/ubersuggestClient.js'
import type {
  AnchorTextsResponse,
  BacklinkOpportunitiesResponse,
  BacklinkOverviewResponse,
  BacklinksTableResponse,
  DomainOverviewResponse,
  DomainTopPagesResponse,
  TrafficEstimationResponse,
} from '../types/endpoints.js'
import { ApiError, ResponseValidationError } from '../../utils/errors.js'
import { pollUntil } from '../../utils/polling.js'
import { ensureBoolean, ensureNumber, ensureRecord, ensureString } from '../../utils/validation.js'

const DEFAULT_BACKLINK_MODE = 'domain'
const DEFAULT_BACKLINK_ORDER_BY = 'domain_inlink_rank'

export class DomainService {
  constructor(
    private readonly client: UbersuggestClient,
    private readonly topCountriesLangLocs: string[],
    private readonly pollIntervalMs = 1_000,
    private readonly pollTimeoutMs = 30_000,
  ) {}

  async getDomainOverview(input: {
    domain: string
    locId: number
    language: string
    withKeywords?: boolean
  }): Promise<DomainOverviewResponse> {
    const response = await this.client.get<Record<string, unknown>>('/api/domain_overview', {
      feature: 'traffic',
      query: {
        domain: input.domain,
        locId: input.locId,
        language: input.language,
        withKeywords: input.withKeywords ?? false,
      },
    })

    const data = ensureRecord(response.data, 'Domain overview response')

    return {
      domain: ensureString(data.domain, 'Domain overview response.domain'),
      organic: ensureNumber(data.organic, 'Domain overview response.organic'),
      traffic: ensureNumber(data.traffic, 'Domain overview response.traffic'),
      paidKeywords: ensureNumber(data.paidKeywords, 'Domain overview response.paidKeywords'),
      paidTraffic: ensureNumber(data.paidTraffic, 'Domain overview response.paidTraffic'),
      domainAuthority: ensureNumber(data.domainAuthority, 'Domain overview response.domainAuthority'),
      backlinks: ensureNumber(data.backlinks, 'Domain overview response.backlinks'),
      refDomains: ensureNumber(data.refDomains, 'Domain overview response.refDomains'),
      serviceInfo: data.serviceInfo && typeof data.serviceInfo === 'object' ? (data.serviceInfo as Record<string, unknown>) : undefined,
      domainTraffic: data.domainTraffic && typeof data.domainTraffic === 'object' ? (data.domainTraffic as Record<string, unknown>) : undefined,
      organicKeywords: Array.isArray(data.organicKeywords)
        ? (data.organicKeywords as Array<Record<string, unknown>>).map(toKeywordMetric)
        : undefined,
    }
  }

  async getDomainTopPages(input: {
    domain: string
    locId: number
    language: string
    limit?: number
    previousKey?: number
  }): Promise<DomainTopPagesResponse> {
    const response = await this.client.get<Record<string, unknown>>('/api/domain_top_pages', {
      feature: 'traffic',
      query: {
        domain: input.domain,
        language: input.language,
        locId: input.locId,
        limit: input.limit ?? 10,
        previousKey: input.previousKey ?? 0,
      },
    })

    const data = ensureRecord(response.data, 'Domain top pages response')
    if (!Array.isArray(data.topPages)) {
      throw new ResponseValidationError('Domain top pages response.topPages must be an array')
    }

    return {
      topPages: data.topPages as Array<Record<string, unknown>>,
      nextKey: typeof data.nextKey === 'number' ? data.nextKey : undefined,
      moreAvailable:
        typeof data.moreAvailable === 'boolean' || data.moreAvailable === null
          ? (data.moreAvailable as boolean | null)
          : undefined,
    }
  }

  async getTrafficEstimation(input: {
    domain: string
    locId: number
    language: string
    includeTopPages?: boolean
    includeTopCountries?: boolean
  }): Promise<TrafficEstimationResponse> {
    const overview = await this.getDomainOverview({
      ...input,
      withKeywords: false,
    })

    const warnings: string[] = []
    const result: TrafficEstimationResponse = {
      overview,
      warnings,
    }

    if (input.includeTopPages) {
      const topPages = await this.getDomainTopPages(input)
      result.topPages = topPages.topPages
    }

    if (input.includeTopCountries) {
      try {
        const topCountries = await this.client.post<Array<Record<string, unknown>>>('/api/domain_top_countries', {
          feature: 'traffic',
          body: {
            domain: input.domain,
            lang_locs: this.topCountriesLangLocs,
          },
        })
        result.topCountries = Array.isArray(topCountries.data) ? topCountries.data : []
      } catch (error) {
        if (error instanceof ApiError && error.status === 403) {
          warnings.push('domain_top_countries returned 403; returning partial traffic estimation without topCountries')
        } else {
          throw error
        }
      }
    }

    return result
  }

  async getBacklinkOverview(input: {
    domain: string
    mode?: string
    includeAnchorTexts?: boolean
    includeBacklinkTable?: boolean
  }): Promise<BacklinkOverviewResponse> {
    const mode = input.mode ?? DEFAULT_BACKLINK_MODE
    const warnings: string[] = []

    const [summaryResponse, overtimeResponse, newLostResponse, daDistributionResponse] = await Promise.all([
      this.client.get<Record<string, unknown>>('/api/backlinks_overview', {
        feature: 'backlinks',
        query: {
          domain: input.domain,
          mode,
        },
      }),
      this.client.get<Array<Record<string, unknown>>>('/api/overtime', {
        feature: 'backlinks',
        query: {
          domain: input.domain,
          mode,
          date_from: getBacklinksDateFrom(),
        },
      }),
      this.client.get<Array<Record<string, unknown>>>('/api/new_lost_linking_domains', {
        feature: 'backlinks',
        query: {
          domain: input.domain,
          mode,
          date_from: getNewLostDateFrom(),
        },
      }),
      this.client.get<Record<string, unknown>>('/api/da_distribution', {
        feature: 'backlinks',
        query: {
          domain: input.domain,
          mode,
        },
      }),
    ])

    const result: BacklinkOverviewResponse = {
      summary: toBacklinksOverviewSummary(summaryResponse.data),
      overtime: Array.isArray(overtimeResponse.data)
        ? overtimeResponse.data.map((point) => toBacklinksTimelinePoint(ensureRecord(point, 'Backlinks overtime item')))
        : [],
      newLostLinkingDomains: Array.isArray(newLostResponse.data)
        ? newLostResponse.data.map((point) => toNewLostLinkingDomainPoint(ensureRecord(point, 'New/lost linking domains item')))
        : [],
      daDistribution: {
        distribution: toNumberArray(ensureRecord(daDistributionResponse.data, 'DA distribution response').distribution),
      },
      warnings,
    }

    if (input.includeAnchorTexts) {
      await this.client.post<Record<string, unknown>>('/api/task_anchors', {
        feature: 'backlinks',
        body: {
          domain: input.domain,
          mode,
        },
      })
      result.anchorTexts = await this.getAnchorTexts({
        domain: input.domain,
        mode,
      })
    }

    if (input.includeBacklinkTable) {
      await this.client.post<Record<string, unknown>>('/api/task_backlinks', {
        feature: 'backlinks',
        body: {
          domain: input.domain,
          mode,
          order_by: 'domain_inlink_rank',
          one_per_domain: true,
        },
      })
      result.backlinks = await this.getBacklinks({
        domain: input.domain,
        mode,
      })
    }

    return result
  }

  async getBacklinks(input: {
    domain: string
    mode?: string
    onePerDomain?: boolean
    limit?: number
    previousKey?: number
    orderBy?: string
  }): Promise<BacklinksTableResponse> {
    const query = {
      domain: input.domain,
      one_per_domain: input.onePerDomain ?? true,
      limit: input.limit ?? 500,
      previousKey: input.previousKey ?? 0,
      mode: input.mode ?? DEFAULT_BACKLINK_MODE,
      order_by: input.orderBy ?? DEFAULT_BACKLINK_ORDER_BY,
    }
    const response = await this.client.get<Record<string, unknown>>('/api/backlinks', {
      feature: 'backlinks',
      query,
    })

    const data = ensureRecord(response.data, 'Backlinks response')
    return {
      done: ensureBoolean(data.done, 'Backlinks response.done'),
      backlinks: Array.isArray(data.backlinks)
        ? data.backlinks.map((item) => toBacklinkRecord(ensureRecord(item, 'Backlinks response item')))
        : [],
    }
  }

  async getAnchorTexts(input: {
    domain: string
    mode?: string
    limit?: number
    previousKey?: number
  }): Promise<AnchorTextsResponse> {
    const query = {
      domain: input.domain,
      mode: input.mode ?? DEFAULT_BACKLINK_MODE,
      previousKey: input.previousKey ?? 0,
      limit: input.limit ?? 25,
    }
    const response = await this.client.get<Record<string, unknown>>('/api/anchor_texts', {
      feature: 'backlinks',
      query,
    })

    const data = ensureRecord(response.data, 'Anchor texts response')
    return {
      done: ensureBoolean(data.done, 'Anchor texts response.done'),
      anchors: Array.isArray(data.anchors)
        ? data.anchors.map((item) => toAnchorTextRecord(ensureRecord(item, 'Anchor texts response item')))
        : [],
      next_key: typeof data.next_key === 'number' ? data.next_key : undefined,
    }
  }

  async getBacklinkOpportunities(input: {
    positive_targets: Array<{ target: string; scope?: string }>
    negative_targets: Array<{ target: string; scope?: string }>
    limit?: number
    previousKey?: number
  }): Promise<BacklinkOpportunitiesResponse> {
    const positiveTargets = normalizeBacklinkTargets(input.positive_targets)
    const negativeTargets = normalizeBacklinkTargets(input.negative_targets)

    await this.client.post<Record<string, unknown>>('/api/task_backlink_opportunity', {
      feature: 'backlinks',
      body: {
        positive_targets: positiveTargets,
        negative_targets: negativeTargets,
      },
    })

    const taskStatus = await pollUntil(
      async () =>
        this.client.post<Record<string, unknown>>('/api/backlink_opportunity', {
          feature: 'backlinks',
          query: {
            previousKey: input.previousKey ?? 0,
            limit: input.limit ?? 100,
          },
          body: {
            positive_targets: positiveTargets,
            negative_targets: negativeTargets,
          },
        }),
      (result) => {
        const data = ensureRecord(result.data, 'Backlink opportunity response')
        return ensureBoolean(data.done, 'Backlink opportunity response.done')
      },
      this.pollIntervalMs,
      this.pollTimeoutMs,
    )

    const data = ensureRecord(taskStatus.data, 'Backlink opportunity response')
    return {
      done: ensureBoolean(data.done, 'Backlink opportunity response.done'),
      link_intersect: Array.isArray(data.link_intersect)
        ? data.link_intersect.map((item) => toBacklinkOpportunityRecord(ensureRecord(item, 'Backlink opportunity item')))
        : [],
      backlinks: Array.isArray(data.backlinks) ? data.backlinks : [],
      nextKey:
        typeof data.nextKey === 'number' || data.nextKey === null
          ? (data.nextKey as number | null)
          : undefined,
    }
  }
}

function normalizeBacklinkTargets(targets: Array<{ target: string; scope?: string }>): Array<{ target: string; scope: string }> {
  return targets.map((target) => ({
    target: target.target,
    scope: target.scope ?? DEFAULT_BACKLINK_MODE,
  }))
}

function toKeywordMetric(metric: Record<string, unknown>) {
  return {
    keyword: String(metric.keyword ?? ''),
    competition: Number(metric.competition ?? 0),
    volume: Number(metric.volume ?? 0),
    cpc: Number(metric.cpc ?? 0),
    cpcDollars: Number(metric.cpcDollars ?? 0),
    sd: Number(metric.sd ?? 0),
    updated_at: Number(metric.updated_at ?? 0),
    pd: Number(metric.pd ?? 0),
    searchIntent: metric.searchIntent === null ? null : String(metric.searchIntent ?? ''),
  }
}

function toBacklinksOverviewSummary(data: Record<string, unknown>) {
  return {
    domainAuthority: ensureNumber(data.domainAuthority, 'Backlinks overview response.domainAuthority'),
    backlinks: ensureNumber(data.backlinks, 'Backlinks overview response.backlinks'),
    refDomains: ensureNumber(data.refDomains, 'Backlinks overview response.refDomains'),
    refDomainsGovEdu: ensureNumber(data.refDomainsGovEdu, 'Backlinks overview response.refDomainsGovEdu'),
    follow: ensureNumber(data.follow, 'Backlinks overview response.follow'),
    noFollow: ensureNumber(data.noFollow, 'Backlinks overview response.noFollow'),
  }
}

function toBacklinksTimelinePoint(data: Record<string, unknown>) {
  return {
    date: ensureString(data.date, 'Backlinks overtime item.date'),
    backlinks: ensureNumber(data.backlinks, 'Backlinks overtime item.backlinks'),
    refdomains: ensureNumber(data.refdomains, 'Backlinks overtime item.refdomains'),
    da: ensureNumber(data.da, 'Backlinks overtime item.da'),
  }
}

function toNewLostLinkingDomainPoint(data: Record<string, unknown>) {
  return {
    date: ensureString(data.date, 'New/lost linking domains item.date'),
    new: ensureNumber(data.new, 'New/lost linking domains item.new'),
    lost: ensureNumber(data.lost, 'New/lost linking domains item.lost'),
  }
}

function toBacklinkRecord(data: Record<string, unknown>) {
  return {
    url_from: ensureString(data.url_from, 'Backlinks response item.url_from'),
    url_to: ensureString(data.url_to, 'Backlinks response item.url_to'),
    title: String(data.title ?? ''),
    anchor: String(data.anchor ?? ''),
    nofollow: ensureBoolean(data.nofollow, 'Backlinks response item.nofollow'),
    inlink_rank: ensureNumber(data.inlink_rank, 'Backlinks response item.inlink_rank'),
    domain_inlink_rank: ensureNumber(data.domain_inlink_rank, 'Backlinks response item.domain_inlink_rank'),
    first_seen: ensureString(data.first_seen, 'Backlinks response item.first_seen'),
    last_visited: ensureString(data.last_visited, 'Backlinks response item.last_visited'),
    date_lost: String(data.date_lost ?? ''),
    spam_score: typeof data.spam_score === 'number' ? data.spam_score : data.spam_score === null ? null : null,
  }
}

function toAnchorTextRecord(data: Record<string, unknown>) {
  return {
    anchor_text: String(data.anchor_text ?? ''),
    external_root_domains: ensureNumber(data.external_root_domains, 'Anchor texts response item.external_root_domains'),
    external_pages: ensureNumber(data.external_pages, 'Anchor texts response item.external_pages'),
  }
}

function toBacklinkOpportunityRecord(data: Record<string, unknown>) {
  return {
    domain_authority: ensureNumber(data.domain_authority, 'Backlink opportunity item.domain_authority'),
    page: ensureString(data.page, 'Backlink opportunity item.page'),
    backlinks: Array.isArray(data.backlinks)
      ? data.backlinks.map((item) => toBacklinkOpportunityBacklink(ensureRecord(item, 'Backlink opportunity backlink item')))
      : [],
    competitors_to: Array.isArray(data.competitors_to)
      ? data.competitors_to.map((item) => String(item))
      : [],
  }
}

function toBacklinkOpportunityBacklink(data: Record<string, unknown>) {
  return {
    page: ensureString(data.page, 'Backlink opportunity backlink item.page'),
    page_authority: ensureNumber(data.page_authority, 'Backlink opportunity backlink item.page_authority'),
    competitor_to: ensureString(data.competitor_to, 'Backlink opportunity backlink item.competitor_to'),
  }
}

function toNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.map((item) => Number(item ?? 0)) : []
}

function getBacklinksDateFrom(now = new Date()): string {
  return `${now.getUTCFullYear() - 3}-${padMonth(now.getUTCMonth() + 1)}-${padDay(now.getUTCDate())}`
}

function getNewLostDateFrom(now = new Date()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  date.setUTCDate(date.getUTCDate() - 30)
  return `${date.getUTCFullYear()}-${padMonth(date.getUTCMonth() + 1)}-${padDay(date.getUTCDate())}`
}

function padMonth(value: number): string {
  return String(value).padStart(2, '0')
}

function padDay(value: number): string {
  return String(value).padStart(2, '0')
}
