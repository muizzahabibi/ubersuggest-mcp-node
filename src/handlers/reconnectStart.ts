import { createContainer } from '../app/container.js'
import { issueConnectCode, startReconnect } from '../app/reconnectRouter.js'
import { requirePrincipal } from '../auth/requestAuth.js'
import { SessionLockError, UbersuggestError } from '../utils/errors.js'
import type { CloudflareBindings } from '../config/loadConfig.js'

export async function handleReconnectStart(request: Request, env: CloudflareBindings): Promise<Response> {
  const container = createContainer(env)

  try {
    const principal = await requirePrincipal(request, container.config)
    container.logger.diagnostic(container.config.diagnosticLogging, request, 'reconnect', 'Reconnect endpoint hit', {
      subject: principal.subject,
    })
    if (request.method === 'GET') {
      const connect = await issueConnectCode(container, principal)
      return Response.json(connect)
    }

    const input = await request.json<
      | { authMode: 'profile'; profilePath: string; chromeProfileDirectory?: string }
      | { authMode?: 'cookies'; cookies: string; format?: 'auto' | 'header' | 'json' | 'netscape' }
    >()
    const result = await startReconnect(container, principal, input)
    return Response.json(result, { status: 202 })
  } catch (error) {
    container.logger.error('Reconnect start failed', {
      error: error instanceof Error ? error.message : String(error),
    })

    if (error instanceof SessionLockError) {
      return Response.json({ ok: false, code: error.name, message: error.message }, { status: 409 })
    }

    if (error instanceof SyntaxError || error instanceof UbersuggestError) {
      return Response.json({
        ok: false,
        code: error instanceof SyntaxError ? 'InvalidJsonBody' : error.name,
        message: error instanceof SyntaxError ? 'Request body must be valid JSON.' : error.message,
      }, { status: 400 })
    }

    return Response.json({ ok: false, code: 'InternalError', message: 'Reconnect request failed. Check server logs and retry.' }, { status: 500 })
  }
}
