import { FEATURE_REFERERS } from './endpointCatalog.js'
import type { UbersuggestAwsConfig } from '../config/loadConfig.js'
import type { RequestOptions } from '../domain/types/common.js'
import type { RuntimeSession } from '../domain/types/session.js'
import { unixSecondsNow } from '../utils/time.js'

export function buildUrl(baseUrl: string, path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(path, baseUrl)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value))
      }
    }
  }

  return url.toString()
}

export function buildRequestInit(
  config: UbersuggestAwsConfig,
  session: RuntimeSession,
  method: 'GET' | 'POST',
  options: RequestOptions,
): RequestInit {
  const refererPath = session.lastRefererByFeature?.[options.feature] ?? FEATURE_REFERERS[options.feature]
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    Authorization: session.authorizationBearer,
    'X-UBS-Data': session.xUbsData,
    ts: unixSecondsNow(),
    Referer: new URL(refererPath, config.baseUrl).toString(),
    Cookie: session.cookiesHeader,
  }

  if (method === 'POST') {
    headers['Content-Type'] = 'application/json'
  }

  return {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(options.body ?? {}) : undefined,
  }
}
