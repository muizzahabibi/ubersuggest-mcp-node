import { z } from 'zod'
import type { ToolContext } from '../../app/container.js'

export const domainOverviewTool = {
  name: 'ubersuggest_domain_overview',
  description: 'Get organic traffic, paid traffic, domain authority, backlinks, historical traffic, and top organic keywords for a domain.',
  inputSchema: z.object({
    domain: z.string(),
    locId: z.number(),
    language: z.string(),
    withKeywords: z.boolean().optional(),
  }),
  outputSchema: z.object({
    domain: z.string(),
    organic: z.number(),
    traffic: z.number(),
    paidKeywords: z.number(),
    paidTraffic: z.number(),
    domainAuthority: z.number(),
    backlinks: z.number(),
    refDomains: z.number(),
    serviceInfo: z.record(z.string(), z.unknown()).optional(),
    domainTraffic: z.record(z.string(), z.unknown()).optional(),
    organicKeywords: z.array(z.record(z.string(), z.unknown())).optional(),
  }),
  execute: (input: { domain: string; locId: number; language: string; withKeywords?: boolean }, context: ToolContext) =>
    context.services.domain.getDomainOverview(input),
}
