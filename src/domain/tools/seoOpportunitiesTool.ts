import { z } from 'zod'
import type { ToolContext } from '../../app/container.js'

export const seoOpportunitiesTool = {
  name: 'ubersuggest_seo_opportunities',
  description: 'Get prioritized SEO opportunity counts and items for a tracked project.',
  inputSchema: z.object({
    projectId: z.string(),
  }),
  outputSchema: z.object({
    opportunities_count: z.record(z.string(), z.unknown()),
    opportunities: z.array(z.record(z.string(), z.unknown())),
    dismissed_opportunities: z.array(z.record(z.string(), z.unknown())),
    done_opportunities: z.array(z.record(z.string(), z.unknown())),
  }),
  execute: (input: { projectId: string }, context: ToolContext) =>
    context.services.siteAudit.getSeoOpportunities(input.projectId),
}
