import { z } from 'zod'
import type { ToolContext } from '../../app/container.js'

const targetSchema = z.object({
  target: z.string(),
  scope: z.enum(['domain']).optional(),
})

export const backlinkOpportunitiesTool = {
  name: 'ubersuggest_backlink_opportunities',
  description: 'Find backlink opportunities where competitor domains have links that the target domain does not.',
  inputSchema: z.object({
    positive_targets: z.array(targetSchema).min(1),
    negative_targets: z.array(targetSchema).min(1),
    limit: z.number().optional(),
    previousKey: z.number().optional(),
  }),
  outputSchema: z.object({
    done: z.boolean(),
    link_intersect: z.array(
      z.object({
        domain_authority: z.number(),
        page: z.string(),
        backlinks: z.array(
          z.object({
            page: z.string(),
            page_authority: z.number(),
            competitor_to: z.string(),
          }),
        ),
        competitors_to: z.array(z.string()),
      }),
    ),
    backlinks: z.array(z.record(z.string(), z.unknown())),
    nextKey: z.number().nullable().optional(),
  }),
  execute: (
    input: {
      positive_targets: Array<{ target: string; scope?: 'domain' }>
      negative_targets: Array<{ target: string; scope?: 'domain' }>
      limit?: number
      previousKey?: number
    },
    context: ToolContext,
  ) => context.services.domain.getBacklinkOpportunities(input),
}
