import { z } from 'zod'
import type { ToolContext } from '../../app/container.js'

export const subscriptionTool = {
  name: 'ubersuggest_subscription',
  description: 'Get the current Ubersuggest subscription and plan metadata for the authenticated account.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    tier: z.string(),
    planInterval: z.string(),
    planCode: z.string(),
    subscriptionStatus: z.string(),
    currency: z.string(),
  }),
  execute: (_input: Record<string, never>, context: ToolContext) => context.services.subscription.getSubscription(),
}
