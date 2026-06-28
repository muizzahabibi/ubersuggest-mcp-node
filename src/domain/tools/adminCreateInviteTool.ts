import { z } from 'zod'
import type { ToolContext } from '../../app/container.js'

const inputSchema = z.object({
  username: z.string().min(1),
})

type AdminCreateInviteInput = z.infer<typeof inputSchema>

type AdminCreateInviteOutput = {
  ok: boolean
  username: string
  inviteUrl: string
  expiresAt: number
  message: string
}

function createAdminInviteResponse(invite: {
  username: string
  inviteUrl: string
  expiresAt: number
}): AdminCreateInviteOutput {
  return {
    ok: true,
    username: invite.username,
    inviteUrl: invite.inviteUrl,
    expiresAt: invite.expiresAt,
    message: 'Invite created.',
  }
}

async function executeAdminCreateInvite(input: AdminCreateInviteInput, context: ToolContext): Promise<AdminCreateInviteOutput> {
  const invite = await context.oauthIdentityService.createInvite(input.username, context.principal)
  return createAdminInviteResponse(invite)
}

export const adminCreateInviteTool = {
  name: 'ubersuggest_admin_create_invite',
  description: 'Create a one-time invite link so a runtime MCP user can set a password without redeploying the server.',
  inputSchema,
  outputSchema: z.object({
    ok: z.boolean(),
    username: z.string(),
    inviteUrl: z.string().url(),
    expiresAt: z.number(),
    message: z.string(),
  }),
  execute: executeAdminCreateInvite,
}
