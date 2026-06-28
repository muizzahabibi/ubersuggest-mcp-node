import { z } from 'zod'
import type { ToolContext } from '../../app/container.js'

export const trafficEstimationTool = {
  name: 'ubersuggest_traffic_estimation',
  description: 'Get a traffic estimation bundle for a domain, including headline metrics, top pages, and locale traffic distribution when available.',
  inputSchema: z.object({
    domain: z.string(),
    locId: z.number(),
    language: z.string(),
    includeTopPages: z.boolean().optional(),
    includeTopCountries: z.boolean().optional(),
  }),
  outputSchema: z.object({
    overview: z.record(z.string(), z.unknown()),
    topPages: z.array(z.record(z.string(), z.unknown())).optional(),
    topCountries: z.array(z.record(z.string(), z.unknown())).optional(),
    warnings: z.array(z.string()),
  }),
  execute: (
    input: { domain: string; locId: number; language: string; includeTopPages?: boolean; includeTopCountries?: boolean },
    context: ToolContext,
  ) => context.services.domain.getTrafficEstimation(input),
}
