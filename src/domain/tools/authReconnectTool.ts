import { z } from 'zod'
import type { ToolContext } from '../../app/container.js'

const inputSchema = z.union([
  z.object({
    authMode: z.literal('profile'),
    profilePath: z.string().min(1),
    chromeProfileDirectory: z.string().min(1).optional(),
  }),
  z.object({
    authMode: z.literal('cookies').optional(),
    cookies: z.string().min(1),
    format: z.enum(['auto', 'header', 'json', 'netscape']).default('auto'),
  }),
])

type AuthReconnectInput = z.infer<typeof inputSchema>
type AuthReconnectOutput = {
  ok: boolean
  queued: boolean
  sessionId: string
  jobId: string
  status: string
  message: string
}

function buildReconnectInput(input: AuthReconnectInput) {
  if (input.authMode === 'profile') {
    return {
      authMode: 'profile' as const,
      profilePath: input.profilePath,
      chromeProfileDirectory: input.chromeProfileDirectory,
    }
  }

  return {
    authMode: 'cookies' as const,
    cookies: {
      raw: input.cookies,
      format: input.format,
    },
  }
}

async function executeAuthReconnect(input: AuthReconnectInput, context: ToolContext): Promise<AuthReconnectOutput> {
  const job = await context.reconnectCoordinator.startManualReconnect(
    context.principal.subject,
    context.sessionId,
    buildReconnectInput(input),
  )

  return {
    ok: true,
    queued: true,
    sessionId: context.sessionId,
    jobId: job.jobId,
    status: job.status,
    message: 'Reconnect job queued.',
  }
}

export const authReconnectTool = {
  name: 'ubersuggest_auth_reconnect',
  description: 'Queue a reconnect job by supplying fresh cookies or a browser profile path so the browser worker can capture fresh runtime auth.',
  inputSchema,
  outputSchema: z.object({
    ok: z.boolean(),
    queued: z.boolean(),
    sessionId: z.string(),
    jobId: z.string(),
    status: z.string(),
    message: z.string(),
  }),
  execute: executeAuthReconnect,
}
