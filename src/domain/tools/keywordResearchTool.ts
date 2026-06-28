import { z } from 'zod'
import type { ToolContext } from '../../app/container.js'

const keywordResearchInputSchema = z.object({
  keywords: z.array(z.string()).min(1),
  locId: z.number(),
  language: z.string(),
  sortby: z.string().optional(),
  limit: z.number().optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  domain: z.string().optional(),
})

type KeywordResearchInput = z.infer<typeof keywordResearchInputSchema>

export const keywordResearchTool = {
  name: 'ubersuggest_keyword_research',
  description: 'Get keyword suggestions and grouped keyword-report data. Requests with more than 3 seed keywords are automatically split into smaller batches.',
  inputSchema: keywordResearchInputSchema,
  outputSchema: z.object({
    searched_keywords: z.array(z.record(z.string(), z.unknown())),
    suggestions: z.array(z.record(z.string(), z.unknown())),
    suggestionCount: z.number(),
    report: z.record(z.string(), z.unknown()).optional(),
  }),
  execute: (input: KeywordResearchInput, context: ToolContext) => context.services.keyword.runKeywordResearch(input),
}
