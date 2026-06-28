CREATE TABLE IF NOT EXISTS site_audit_cache (
  cache_key TEXT PRIMARY KEY,
  domain_url TEXT NOT NULL,
  devices TEXT NOT NULL,
  pagespeed_json TEXT NOT NULL,
  seo_opportunities_json TEXT NOT NULL,
  google_services_json TEXT,
  cached_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_site_audit_cache_domain
  ON site_audit_cache(domain_url);
