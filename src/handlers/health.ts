import { createContainer } from '../app/container.js'
import { getHealth } from '../app/healthRouter.js'
import type { CloudflareBindings } from '../config/loadConfig.js'

export function handleHealth(env: CloudflareBindings): Response {
  return Response.json(getHealth(createContainer(env)))
}
