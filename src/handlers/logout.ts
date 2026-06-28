import { createContainer } from '../app/container.js'
import { requirePrincipal } from '../auth/requestAuth.js'
import type { CloudflareBindings } from '../config/loadConfig.js'

export async function handleLogout(request: Request, env: CloudflareBindings): Promise<Response> {
  const container = createContainer(env)
  const principal = await requirePrincipal(request, container.config)
  const context = container.createToolContext(principal)
  const session = await context.reconnectCoordinator.resetSession(principal.subject, context.sessionId)

  return Response.json({
    ok: true,
    sessionId: context.sessionId,
    status: session.status,
    message: 'Stored auth session reset.',
  })
}
