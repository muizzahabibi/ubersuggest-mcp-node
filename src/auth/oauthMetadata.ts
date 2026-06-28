import type { CloudflareBindings, UbersuggestAwsConfig } from '../config/loadConfig.js'
import type { OAuthUrls } from '../domain/types/oauth.js'

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

function getRequestOrigin(request: Request): string {
  return new URL(request.url).origin
}

export function resolveOAuthUrls(request: Request, config: UbersuggestAwsConfig): OAuthUrls {
  const issuer = normalizeBaseUrl(config.publicBaseUrl ?? getRequestOrigin(request))
  return {
    issuer,
    authorizeUrl: `${issuer}/login`,
    tokenUrl: `${issuer}/t`,
    registrationUrl: `${issuer}/r`,
    authorizationServerMetadataUrl: `${issuer}/.well-known/oauth-authorization-server`,
    openIdConfigurationUrl: `${issuer}/.well-known/openid-configuration`,
    protectedResourceMetadataUrl: `${issuer}/.well-known/oauth-protected-resource`,
    resource: `${issuer}/mcp`,
  }
}
