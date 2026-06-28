import { z } from 'zod'
import type { ToolContext } from '../../app/container.js'

const inputSchema = z.object({})

type AuthLogoutOutput = {
  ok: boolean
  sessionId: string
  status: string
  message: string
}

async function executeAuthLogout(_input: Record<string, never>, context: ToolContext): Promise<AuthLogoutOutput> {
  const session = await context.reconnectCoordinator.resetSession(context.principal.subject, context.sessionId)

  return {
    ok: true,
    sessionId: context.sessionId,
    status: session.status,
    message: 'Stored auth session reset.',
  }
}

export const authLogoutTool = {
  name: 'ubersuggest_auth_logout',
  description: 'Reset the stored Ubersuggest runtime auth for the current MCP user so the next request requires reconnect.',
  inputSchema,
  outputSchema: z.object({
    ok: z.boolean(),
    sessionId: z.string(),
    status: z.string(),
    message: z.string(),
  }),
  execute: executeAuthLogout,
}
