import type { FeatureName } from '../domain/types/session.js'

export const FEATURE_REFERERS: Record<FeatureName, string> = {
  bootstrap: '/en/dashboard',
  traffic: '/en/traffic_analyzer/overview',
  keyword: '/en/ubersuggest/keyword_ideas/',
  siteAudit: '/en/seo_analyzer/site_audit/',
  backlinks: '/en/seo_analyzer/backlinks/',
}
