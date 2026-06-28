import { createContainer } from '../app/container.js'
import { getProtectedResourceMetadata } from '../app/oauthRouter.js'
import type { CloudflareBindings } from '../config/loadConfig.js'

export function handleOAuthProtectedResource(request: Request, env: CloudflareBindings): Response {
  return Response.json(getProtectedResourceMetadata(request, createContainer(env).config))
}
