import { createContainer } from '../app/container.js'
import { startDynamicClientRegistration } from '../app/oauthRouter.js'
import { AuthError } from '../utils/errors.js'
import type { CloudflareBindings } from '../config/loadConfig.js'

export async function handleRegister(request: Request, env: CloudflareBindings): Promise<Response> {
  const container = createContainer(env)

  try {
    if (request.method !== 'POST') {
      return Response.json({ error: 'invalid_request', error_description: 'registration endpoint only accepts POST' }, { status: 405 })
    }
    return Response.json(await startDynamicClientRegistration(request), { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: 'invalid_client_metadata', error_description: error.message }, { status: 400 })
    }
    container.logger.error('Client registration failed', { error: error instanceof Error ? error.message : String(error) })
    return Response.json({ error: 'server_error', error_description: 'Client registration failed. Check server logs and retry.' }, { status: 500 })
  }
}
