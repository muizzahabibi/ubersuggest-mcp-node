import { createContainer } from '../app/container.js'
import { handleAuthorize, renderAuthorizeLogin } from '../app/oauthRouter.js'
import { AuthError } from '../utils/errors.js'
import type { CloudflareBindings } from '../config/loadConfig.js'

export async function handleAuthorizeRoute(request: Request, env: CloudflareBindings): Promise<Response> {
  const container = createContainer(env)

  try {
    if (request.method === 'GET') {
      const response = await renderAuthorizeLogin(request, container.config, container)
      if (typeof response === 'string') {
        return new Response(response, { headers: { 'content-type': 'text/html; charset=utf-8' } })
      }
      return Response.redirect(response.redirectUrl, 302)
    }

    if (request.method === 'POST') {
      const response = await handleAuthorize(request, container.config, container)
      if (response.startsWith('<!doctype html>')) {
        return new Response(response, { headers: { 'content-type': 'text/html; charset=utf-8' } })
      }
      return Response.redirect(response, 302)
    }

    return new Response('Method not allowed', { status: 405 })
  } catch (error) {
    if (error instanceof AuthError) {
      return new Response(error.message, { status: 400 })
    }

    container.logger.error('Authorize request failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Authorize request failed. Check server logs and retry.', { status: 500 })
  }
}
