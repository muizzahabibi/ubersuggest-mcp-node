import { z } from 'zod'
import type { ToolContext } from '../../app/container.js'

export const backlinkOverviewTool = {
  name: 'ubersuggest_backlink_overview',
  description: 'Get backlink summary, historical trend, new/lost referring domains, DA distribution, and optional anchor text or backlink table data for a domain.',
  inputSchema: z.object({
    domain: z.string(),
    mode: z.string().optional(),
    includeAnchorTexts: z.boolean().optional(),
    includeBacklinkTable: z.boolean().optional(),
  }),
  outputSchema: z.object({
    summary: z.object({
      domainAuthority: z.number(),
      backlinks: z.number(),
      refDomains: z.number(),
      refDomainsGovEdu: z.number(),
      follow: z.number(),
      noFollow: z.number(),
    }),
    overtime: z.array(
      z.object({
        date: z.string(),
        backlinks: z.number(),
        refdomains: z.number(),
        da: z.number(),
      }),
    ),
    newLostLinkingDomains: z.array(
      z.object({
        date: z.string(),
        new: z.number(),
        lost: z.number(),
      }),
    ),
    daDistribution: z.object({
      distribution: z.array(z.number()),
    }),
    anchorTexts: z
      .object({
        done: z.boolean(),
        anchors: z.array(
          z.object({
            anchor_text: z.string(),
            external_root_domains: z.number(),
            external_pages: z.number(),
          }),
        ),
        next_key: z.number().optional(),
      })
      .optional(),
    backlinks: z
      .object({
        done: z.boolean(),
        backlinks: z.array(
          z.object({
            url_from: z.string(),
            url_to: z.string(),
            title: z.string(),
            anchor: z.string(),
            nofollow: z.boolean(),
            inlink_rank: z.number(),
            domain_inlink_rank: z.number(),
            first_seen: z.string(),
            last_visited: z.string(),
            date_lost: z.string(),
            spam_score: z.number().nullable(),
          }),
        ),
      })
      .optional(),
    warnings: z.array(z.string()),
  }),
  execute: (
    input: { domain: string; mode?: string; includeAnchorTexts?: boolean; includeBacklinkTable?: boolean },
    context: ToolContext,
  ) => context.services.domain.getBacklinkOverview(input),
}
