import { z } from 'zod'
import type { ToolContext } from '../../app/container.js'

export const domainTopPagesTool = {
  name: 'ubersuggest_domain_top_pages',
  description: 'List the top traffic-driving pages for a domain in a given language/location market.',
  inputSchema: z.object({
    domain: z.string(),
    locId: z.number(),
    language: z.string(),
    limit: z.number().optional(),
    previousKey: z.number().optional(),
  }),
  outputSchema: z.object({
    topPages: z.array(z.record(z.string(), z.unknown())),
    nextKey: z.number().optional(),
    moreAvailable: z.boolean().nullable().optional(),
  }),
  execute: (
    input: { domain: string; locId: number; language: string; limit?: number; previousKey?: number },
    context: ToolContext,
  ) => context.services.domain.getDomainTopPages(input),
}
