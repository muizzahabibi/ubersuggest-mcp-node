import type { AuthenticatedPrincipal } from '../domain/types/oauth.js'
import type { UbersuggestAwsConfig } from '../config/loadConfig.js'
import { resolveOAuthUrls } from './oauthMetadata.js'
import { verifyAccessToken } from './oauthTokens.js'
import { createPrincipal } from './principal.js'
import { AuthError } from '../utils/errors.js'
import { D1OAuthIdentityStore } from '../adapters/cloudflare/d1OAuthIdentityStore.js'
import { OAuthIdentityService } from './oauthIdentityService.js'

export function buildWwwAuthenticateHeader(resourceMetadataUrl: string, scope = 'mcp:tools'): string {
  return `Bearer realm="mcp", resource_metadata="${resourceMetadataUrl}", scope="${scope}"`
}

function getBearerToken(request: Request): string | undefined {
  const authorization = request.headers.get('authorization')
  if (!authorization) {
    return undefined
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]
}

export async function requirePrincipal(request: Request, config: UbersuggestAwsConfig): Promise<AuthenticatedPrincipal> {
  const token = getBearerToken(request)
  if (!token) {
    throw new AuthError('Missing bearer token')
  }

  for (const [username, configuredToken] of Object.entries(config.authTokens)) {
    if (token === configuredToken) {
      return createPrincipal(username)
    }
  }

  const oauthIdentityService = new OAuthIdentityService(config, new D1OAuthIdentityStore(config.db))
  const storedToken = await oauthIdentityService.getMcpBearerToken(token)
  if (storedToken) {
    await oauthIdentityService.touchMcpBearerToken(storedToken.tokenId)
    return createPrincipal(storedToken.username)
  }

  try {
    const urls = resolveOAuthUrls(request, config)
    const claims = verifyAccessToken(token, config.oauthSigningSecret, urls.resource)
    return createPrincipal(claims.username)
  } catch {
    throw new AuthError('Bearer token is invalid')
  }
}
