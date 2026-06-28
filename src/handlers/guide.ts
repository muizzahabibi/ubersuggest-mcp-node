import { createContainer } from '../app/container.js'
import { renderGuideHtml } from '../app/docsContent.js'
import type { CloudflareBindings } from '../config/loadConfig.js'

export function handleGuide(request: Request, env: CloudflareBindings): Response {
  const container = createContainer(env)

  return new Response(renderGuideHtml(request, container.config), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  })
}
