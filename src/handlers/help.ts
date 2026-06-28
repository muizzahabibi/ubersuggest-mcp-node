import { createContainer } from '../app/container.js'
import { getHelpMarkdown } from '../app/docsContent.js'
import type { CloudflareBindings } from '../config/loadConfig.js'

export function handleHelp(request: Request, env: CloudflareBindings): Response {
  const container = createContainer(env)

  return new Response(getHelpMarkdown(request, container.config), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
    },
  })
}
