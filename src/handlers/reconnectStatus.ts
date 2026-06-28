import { createContainer } from '../app/container.js'
import { requirePrincipal } from '../auth/requestAuth.js'
import type { CloudflareBindings } from '../config/loadConfig.js'

export async function handleReconnectStatus(request: Request, env: CloudflareBindings, jobId: string): Promise<Response> {
  const container = createContainer(env)
  const principal = await requirePrincipal(request, container.config)
  container.logger.diagnostic(container.config.diagnosticLogging, request, 'reconnect', 'Reconnect status polled', {
    subject: principal.subject,
    jobId,
  })
  const job = await container.reconnectCoordinator.getJob(jobId, principal.subject)

  if (!job) {
    return Response.json({ ok: false, message: 'Reconnect job not found.' }, { status: 404 })
  }

  return Response.json({ ok: true, job })
}
