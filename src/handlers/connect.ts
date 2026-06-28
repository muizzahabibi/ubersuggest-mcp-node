import { createContainer } from '../app/container.js'
import { handleConnectSubmission, renderConnectPageForCode } from '../app/reconnectRouter.js'
import { AuthError } from '../utils/errors.js'
import type { CloudflareBindings } from '../config/loadConfig.js'

export async function handleConnect(request: Request, env: CloudflareBindings): Promise<Response> {
  const container = createContainer(env)

  try {
    if (request.method === 'GET') {
      const code = new URL(request.url).searchParams.get('code')?.trim()
      if (!code) {
        return new Response('Connect code is required', { status: 400 })
      }
      return new Response(await renderConnectPageForCode(container, code), { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }
    if (request.method === 'POST') {
      return new Response(await handleConnectSubmission(request, container), { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }
    return new Response('Method not allowed', { status: 405 })
  } catch (error) {
    if (error instanceof AuthError) {
      return new Response(error.message, { status: 400 })
    }
    container.logger.error('Connect request failed', { error: error instanceof Error ? error.message : String(error) })
    return new Response('Connect request failed. Check server logs and retry.', { status: 500 })
  }
}
