export interface KeywordMetric {
  keyword: string
  competition: number
  volume: number
  cpc: number
  cpcDollars: number
  sd: number
  updated_at: number
  pd: number
  searchIntent: string | null
}

export interface ProjectLocation {
  loc_id: number
  lang: string
}

export interface ProjectRecord {
  id: string
  domain: string
  title: string
  locations: ProjectLocation[]
}

export interface SubscriptionResponse {
  tier: string
  planInterval: string
  planCode: string
  subscriptionStatus: string
  currency: string
}

export interface DomainOverviewResponse {
  domain: string
  organic: number
  traffic: number
  paidKeywords: number
  paidTraffic: number
  domainAuthority: number
  backlinks: number
  refDomains: number
  serviceInfo?: Record<string, unknown>
  domainTraffic?: Record<string, unknown>
  organicKeywords?: KeywordMetric[]
}

export interface DomainTopPagesResponse {
  topPages: Array<Record<string, unknown>>
  nextKey?: number
  moreAvailable?: boolean | null
}

export interface TrafficEstimationResponse {
  overview: DomainOverviewResponse
  topPages?: Array<Record<string, unknown>>
  topCountries?: Array<Record<string, unknown>>
  warnings: string[]
}

export interface BacklinksOverviewSummary {
  domainAuthority: number
  backlinks: number
  refDomains: number
  refDomainsGovEdu: number
  follow: number
  noFollow: number
}

export interface BacklinksTimelinePoint {
  date: string
  backlinks: number
  refdomains: number
  da: number
}

export interface NewLostLinkingDomainPoint {
  date: string
  new: number
  lost: number
}

export interface BacklinkRecord {
  url_from: string
  url_to: string
  title: string
  anchor: string
  nofollow: boolean
  inlink_rank: number
  domain_inlink_rank: number
  first_seen: string
  last_visited: string
  date_lost: string
  spam_score: number | null
}

export interface BacklinksTableResponse {
  done: boolean
  backlinks: BacklinkRecord[]
}

export interface AnchorTextRecord {
  anchor_text: string
  external_root_domains: number
  external_pages: number
}

export interface AnchorTextsResponse {
  done: boolean
  anchors: AnchorTextRecord[]
  next_key?: number
}

export interface BacklinkOpportunityBacklink {
  page: string
  page_authority: number
  competitor_to: string
}

export interface BacklinkOpportunityRecord {
  domain_authority: number
  page: string
  backlinks: BacklinkOpportunityBacklink[]
  competitors_to: string[]
}

export interface BacklinkOpportunitiesResponse {
  done: boolean
  link_intersect: BacklinkOpportunityRecord[]
  backlinks: Array<Record<string, unknown>>
  nextKey?: number | null
}

export interface BacklinkOverviewResponse {
  summary: BacklinksOverviewSummary
  overtime: BacklinksTimelinePoint[]
  newLostLinkingDomains: NewLostLinkingDomainPoint[]
  daDistribution: { distribution: number[] }
  anchorTexts?: AnchorTextsResponse
  backlinks?: BacklinksTableResponse
  warnings: string[]
}

export interface KeywordResearchResponse {
  searched_keywords: KeywordMetric[]
  suggestions: KeywordMetric[]
  suggestionCount: number
  report?: Record<string, unknown>
}

export interface SeoOpportunitiesResponse {
  opportunities_count: Record<string, unknown>
  opportunities: Array<Record<string, unknown>>
  dismissed_opportunities: Array<Record<string, unknown>>
  done_opportunities: Array<Record<string, unknown>>
}

export interface SiteAuditResponse {
  pagespeed: Record<string, unknown>
  seoOpportunities: SeoOpportunitiesResponse
  googleServicesStatus?: Record<string, unknown>
}

export interface ApiRequestResult<T> {
  status: number
  data: T
  headers: Record<string, string>
}
