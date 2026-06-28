import { createContainer } from '../app/container.js'
import { getAuthorizationServerMetadata, getOpenIdConfiguration } from '../app/oauthRouter.js'
import type { CloudflareBindings } from '../config/loadConfig.js'

export function handleOAuthAuthorizationServer(request: Request, env: CloudflareBindings): Response {
  const container = createContainer(env)
  const path = new URL(request.url).pathname
  const body = path.endsWith('/openid-configuration')
    ? getOpenIdConfiguration(request, container.config)
    : getAuthorizationServerMetadata(request, container.config)
  return Response.json(body)
}
