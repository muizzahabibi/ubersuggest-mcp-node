import { z } from 'zod'
import type { ToolContext } from '../../app/container.js'

export const projectsTool = {
  name: 'ubersuggest_projects',
  description: 'List available tracked projects, including project IDs, domains, and locations.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    projects: z.array(
      z.object({
        id: z.string(),
        domain: z.string(),
        title: z.string(),
        locations: z.array(
          z.object({
            loc_id: z.number(),
            lang: z.string(),
          }),
        ),
      }),
    ),
  }),
  execute: (_input: Record<string, never>, context: ToolContext) => context.services.projects.listProjects(),
}
