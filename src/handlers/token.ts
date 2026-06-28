import { createContainer } from '../app/container.js'
import { exchangeAuthorizationCode } from '../app/oauthRouter.js'
import { AuthError, InvalidRequestError } from '../utils/errors.js'
import type { CloudflareBindings } from '../config/loadConfig.js'

export async function handleToken(request: Request, env: CloudflareBindings): Promise<Response> {
  const container = createContainer(env)

  try {
    if (request.method !== 'POST') {
      return Response.json({ error: 'invalid_request', error_description: 'token endpoint only accepts POST' }, { status: 405 })
    }
    return Response.json(await exchangeAuthorizationCode(request, container.config, container))
  } catch (error) {
    if (error instanceof InvalidRequestError) {
      return Response.json({ error: 'invalid_request', error_description: error.message }, { status: 400 })
    }
    if (error instanceof AuthError) {
      return Response.json({ error: 'invalid_grant', error_description: error.message }, { status: 400 })
    }
    container.logger.error('Token exchange failed', { error: error instanceof Error ? error.message : String(error) })
    return Response.json({ error: 'server_error', error_description: 'Token exchange failed. Check server logs and retry.' }, { status: 500 })
  }
}
