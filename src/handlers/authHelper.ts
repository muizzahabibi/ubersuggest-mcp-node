import { createContainer } from '../app/container.js'
import { handleAuthHelperSubmission, renderAuthHelperPage } from '../app/reconnectRouter.js'
import type { CloudflareBindings } from '../config/loadConfig.js'

export async function handleAuthHelper(request: Request, env: CloudflareBindings): Promise<Response> {
  const container = createContainer(env)

  try {
    if (request.method === 'GET') {
      return new Response(await renderAuthHelperPage(), { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }
    if (request.method === 'POST') {
      const response = await handleAuthHelperSubmission(request, container)
      if (response.startsWith('<!doctype html>')) {
        return new Response(response, { headers: { 'content-type': 'text/html; charset=utf-8' } })
      }
      return Response.redirect(response, 302)
    }
    return new Response('Method not allowed', { status: 405 })
  } catch (error) {
    container.logger.error('Auth helper failed', { error: error instanceof Error ? error.message : String(error) })
    return new Response('Auth helper failed. Check server logs and retry.', { status: 500 })
  }
}
