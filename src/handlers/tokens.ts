import { createContainer } from '../app/container.js'
import { handleTokens, renderTokens } from '../app/oauthRouter.js'
import { AuthError } from '../utils/errors.js'
import type { CloudflareBindings } from '../config/loadConfig.js'

export async function handleTokensRoute(request: Request, env: CloudflareBindings): Promise<Response> {
  const container = createContainer(env)

  try {
    if (request.method === 'GET') {
      return new Response(await renderTokens(request, container.config, container), { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }

    if (request.method === 'POST') {
      return new Response(await handleTokens(request, container.config, container), { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }

    return new Response('Method not allowed', { status: 405 })
  } catch (error) {
    if (error instanceof AuthError) {
      return new Response(error.message, { status: 400 })
    }

    container.logger.error('Token management request failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Token management request failed. Check server logs and retry.', { status: 500 })
  }
}
