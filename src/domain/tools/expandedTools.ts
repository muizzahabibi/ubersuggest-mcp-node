import { z } from 'zod'
import type { ToolContext } from '../../app/container.js'

type Feature = 'bootstrap' | 'traffic' | 'keyword' | 'siteAudit' | 'backlinks'
type Method = 'GET' | 'POST'

type ToolSpec = {
  name: string
  description: string
  method: Method
  path: string
  feature: Feature
  inputSchema: z.ZodTypeAny
  map?: (input: any) => any
}

const empty = z.object({})
const domain = z.object({ domain: z.string(), language: z.string().optional(), locId: z.number().optional() })
const page = z.object({ page: z.string(), language: z.string().optional(), locId: z.number().optional(), limit: z.number().optional() })
const backlinkTarget = z.object({ target: z.string(), scope: z.enum(['domain', 'url', 'host']).optional() })
const langLoc = { language: z.string().optional(), locId: z.number().optional() }

function query(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Record<string, string | number | boolean | undefined>
}

function makeTool(spec: ToolSpec) {
  return {
    name: spec.name,
    description: spec.description,
    inputSchema: spec.inputSchema,
    async execute(input: any, context: ToolContext) {
      const payload = spec.map ? spec.map(input) : input
      if (spec.method === 'GET') {
        return context.services.raw.get(spec.path, spec.feature, query(payload ?? {}))
      }
      return context.services.raw.post(spec.path, spec.feature, payload ?? {})
    },
  }
}

const specs: ToolSpec[] = [
  { name: 'add_project_competitors', description: 'Add competitors to an existing project.', method: 'POST', path: '/api/projects/competitors', feature: 'bootstrap', inputSchema: z.object({ project_id: z.string(), competitors: z.record(z.string(), z.array(z.object({ lang: z.string(), loc_id: z.number() }))), competitors_locations: z.array(z.object({ lang: z.string(), loc_id: z.number() })).optional() }) },
  { name: 'domain_top_countries', description: 'Get top countries for domain organic traffic.', method: 'POST', path: '/api/domain_top_countries', feature: 'traffic', inputSchema: z.object({ domain: z.string(), lang_locs: z.array(z.string()), path: z.string().optional() }) },
  { name: 'estimate_serp_clicks', description: 'Estimate monthly SERP clicks.', method: 'POST', path: '/api/estimate_serp_clicks', feature: 'keyword', inputSchema: z.object({ serps: z.array(z.record(z.string(), z.any())) }) },
  { name: 'backlink_opportunity', description: 'Find backlink opportunities.', method: 'POST', path: '/api/backlink_opportunities', feature: 'backlinks', inputSchema: z.object({ positive_targets: z.array(backlinkTarget), negative_targets: z.array(backlinkTarget).optional(), limit: z.number().optional(), offset: z.number().optional() }), map: (i) => ({ ...i, previousKey: i.offset ?? 0 }) },
  { name: 'project_position_info', description: 'Get tracked keyword ranking positions for a project.', method: 'POST', path: '/api/project_position_info', feature: 'bootstrap', inputSchema: z.object({ project_id: z.string(), startDate: z.string(), endDate: z.string(), language: z.string().optional(), locId: z.number().optional(), device: z.enum(['desktop', 'mobile']).optional() }) },
  { name: 'add_project_keywords', description: 'Add keywords to an existing project.', method: 'POST', path: '/api/projects/keywords', feature: 'bootstrap', inputSchema: z.object({ project_id: z.string(), keywords: z.record(z.string(), z.array(z.object({ lang: z.string(), loc_id: z.number() }))) }) },
  { name: 'search_neilpatel_blog', description: 'Search Neil Patel blog articles.', method: 'POST', path: '/api/search_neilpatel_blog', feature: 'keyword', inputSchema: z.object({ query: z.string().optional(), category: z.string().optional(), limit: z.number().optional(), full_content: z.boolean().optional() }) },
  { name: 'keyword_suggestions', description: 'Get keyword suggestions.', method: 'POST', path: '/api/keyword_suggestions', feature: 'keyword', inputSchema: z.object({ keywords: z.array(z.string()), language: z.string().optional(), locId: z.number().optional() }) },
  { name: 'google_suggestions', description: 'Get Google autocomplete suggestions.', method: 'POST', path: '/api/google_suggestions', feature: 'keyword', inputSchema: z.object({ keywords: z.array(z.string()), language: z.string().optional(), country: z.string().optional() }) },
  { name: 'backlinks_overview', description: 'Get backlink summary for a domain.', method: 'GET', path: '/api/backlinks_overview', feature: 'backlinks', inputSchema: z.object({ domain: z.string(), mode: z.enum(['domain', 'page', 'host']).optional() }) },
  { name: 'site_audit_status', description: 'Check site audit crawl status.', method: 'GET', path: '/api/site_audit/status', feature: 'siteAudit', inputSchema: z.object({ domain: z.string(), path: z.string().optional(), crawlMaxPages: z.number().optional() }) },
  { name: 'site_audit_results', description: 'Get pages affected by a site audit issue.', method: 'GET', path: '/api/site_audit/results', feature: 'siteAudit', inputSchema: z.object({ domain: z.string(), issue: z.string(), path: z.string().optional() }) },
  { name: 'seo_opportunities', description: 'Get SEO opportunities for a project.', method: 'GET', path: '/api/seo_opportunities', feature: 'siteAudit', inputSchema: z.object({ project_id: z.string() }) },
  { name: 'domain_overview', description: 'Get domain traffic overview.', method: 'GET', path: '/api/domain_overview', feature: 'traffic', inputSchema: domain.extend({ withKeywords: z.boolean().optional() }) },
  { name: 'domain_keywords', description: 'Get organic or paid domain keywords.', method: 'GET', path: '/api/domain_keywords', feature: 'traffic', inputSchema: domain.extend({ searchType: z.enum(['organic', 'paid']).optional(), limit: z.number().optional(), previousKey: z.number().optional() }) },
  { name: 'domain_top_pages', description: 'Get top traffic-driving pages for a domain.', method: 'GET', path: '/api/domain_top_pages', feature: 'traffic', inputSchema: domain.extend({ limit: z.number().optional(), offset: z.number().optional() }), map: (i) => ({ ...i, previousKey: i.offset ?? 0 }) },
  { name: 'keyword_overview', description: 'Get keyword search volume and difficulty.', method: 'GET', path: '/api/keyword_overview', feature: 'keyword', inputSchema: z.object({ keyword: z.string(), language: z.string().optional(), locId: z.number().optional() }) },
  { name: 'keyword_metrics', description: 'Get keyword metric.', method: 'GET', path: '/api/keyword_metrics', feature: 'keyword', inputSchema: z.object({ keyword: z.string(), language: z.string(), locId: z.number().optional(), metric: z.enum(['search_difficulty', 'search_intent']) }) },
  { name: 'match_keywords', description: 'Find keywords matching seed terms.', method: 'POST', path: '/api/match_keywords', feature: 'keyword', inputSchema: z.object({ keywords: z.array(z.string()), language: z.string().optional(), locId: z.number().optional(), limit: z.number().optional(), sortby: z.string().optional(), domain: z.string().optional() }) },
  { name: 'linking_domains', description: 'List referring domains linking to target.', method: 'GET', path: '/api/linking_domains', feature: 'backlinks', inputSchema: z.object({ domain: z.string(), mode: z.enum(['domain', 'url', 'host']).optional(), filter_by: z.enum(['new', 'lost', 'all']).optional(), begin_date: z.string().optional(), end_date: z.string().optional(), limit: z.number().optional(), offset: z.number().optional() }), map: (i) => ({ ...i, previousKey: i.offset ?? 0 }) },
  { name: 'site_audit_pages', description: 'List pages crawled during site audit.', method: 'GET', path: '/api/site_audit/pages', feature: 'siteAudit', inputSchema: z.object({ domain: z.string() }) },
  { name: 'pagespeed_audit', description: 'Run PageSpeed audit.', method: 'POST', path: '/api/pagespeed_audit', feature: 'siteAudit', inputSchema: z.object({ domain: z.string(), devices: z.string().optional(), forceUpdate: z.boolean().optional() }) },
  { name: 'create_project', description: 'Create a tracked project.', method: 'POST', path: '/api/projects', feature: 'bootstrap', inputSchema: z.object({ domain: z.string(), title: z.string().optional(), locations: z.array(z.object({ lang: z.string(), loc_id: z.number() })), keywords: z.record(z.string(), z.array(z.object({ lang: z.string(), loc_id: z.number() }))).optional(), competitors: z.record(z.string(), z.array(z.object({ lang: z.string(), loc_id: z.number() }))).optional() }) },
  { name: 'location_suggest', description: 'Search location IDs by name.', method: 'GET', path: '/api/location_suggest', feature: 'keyword', inputSchema: z.object({ query: z.string(), lang: z.string().optional(), limit: z.number().optional() }) },
  { name: 'location_details', description: 'Get location ID details.', method: 'POST', path: '/api/location_details', feature: 'keyword', inputSchema: z.object({ location_ids: z.array(z.union([z.string(), z.number()])), lang: z.string().optional() }) },
  { name: 'auth_status', description: 'Check auth status.', method: 'GET', path: '/api/subscription', feature: 'bootstrap', inputSchema: empty },
  { name: 'competitors', description: 'Find organic competitors.', method: 'POST', path: '/api/competitors', feature: 'traffic', inputSchema: z.object({ domain: z.string(), language: z.string().optional(), locId: z.number().optional(), limit: z.number().optional(), competitors: z.array(z.string()).optional() }) },
  { name: 'page_overview', description: 'Get overview for a specific page.', method: 'GET', path: '/api/page_overview', feature: 'traffic', inputSchema: page },
  { name: 'page_keywords', description: 'Get keywords that a page ranks for.', method: 'GET', path: '/api/page_keywords', feature: 'traffic', inputSchema: page },
  { name: 'traffic_value', description: 'Get estimated traffic value.', method: 'GET', path: '/api/traffic_value', feature: 'traffic', inputSchema: z.object({ domain: z.string() }) },
  { name: 'serp_analysis', description: 'Analyze SERP for a keyword.', method: 'GET', path: '/api/serp_analysis', feature: 'keyword', inputSchema: z.object({ keyword: z.string(), language: z.string().optional(), locId: z.number().optional(), limit: z.number().optional() }) },
  { name: 'anchor_texts', description: 'Get common anchor texts.', method: 'GET', path: '/api/anchor_texts', feature: 'backlinks', inputSchema: z.object({ domain: z.string(), mode: z.enum(['domain', 'page']).optional(), limit: z.number().optional(), offset: z.number().optional() }), map: (i) => ({ ...i, previousKey: i.offset ?? 0 }) },
  { name: 'content_ideas', description: 'Get content ideas for keywords.', method: 'POST', path: '/api/content_ideas', feature: 'keyword', inputSchema: z.object({ keywords: z.array(z.string()), language: z.string().optional(), locId: z.number().optional(), limit: z.number().optional(), offset: z.number().optional(), sortby: z.string().optional(), filters: z.record(z.string(), z.any()).optional() }), map: (i) => ({ ...i, previousKey: i.offset ?? 0 }) },
  { name: 'page_shares', description: 'Get social shares and backlink metrics for URLs.', method: 'POST', path: '/api/page_shares', feature: 'traffic', inputSchema: z.object({ page_urls: z.array(z.string()), language: z.string().optional(), locId: z.number().optional(), mode: z.enum(['domain', 'url', 'host']).optional() }) },
  { name: 'list_projects', description: 'List tracked projects.', method: 'GET', path: '/api/projects', feature: 'bootstrap', inputSchema: empty },
  { name: 'get_project', description: 'Get project details.', method: 'GET', path: '/api/project', feature: 'bootstrap', inputSchema: z.object({ project_id: z.string() }) },
  { name: 'validate_site', description: 'Validate site reachability.', method: 'POST', path: '/api/validate_site', feature: 'bootstrap', inputSchema: z.object({ site: z.string(), is_domain: z.boolean().optional() }) },
  { name: 'backlinks', description: 'List backlinks.', method: 'GET', path: '/api/backlinks', feature: 'backlinks', inputSchema: z.object({ domain: z.string(), mode: z.enum(['domain', 'page']).optional(), limit: z.number().optional(), offset: z.number().optional(), one_per_domain: z.boolean().optional(), order_by: z.string().optional() }), map: (i) => ({ ...i, previousKey: i.offset ?? 0 }) },
  { name: 'site_audit', description: 'Start site audit crawl.', method: 'POST', path: '/api/site_audit', feature: 'siteAudit', inputSchema: z.object({ domain: z.string(), path: z.string().optional(), crawlMaxPages: z.number().optional(), recrawl: z.boolean().optional() }) },
]

export const expandedTools = specs.map(makeTool)
