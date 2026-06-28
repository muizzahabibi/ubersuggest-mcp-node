import { adminCreateInviteTool } from '../domain/tools/adminCreateInviteTool.js'
import { authLogoutTool } from '../domain/tools/authLogoutTool.js'
import { authReconnectTool } from '../domain/tools/authReconnectTool.js'
import { backlinkOpportunitiesTool } from '../domain/tools/backlinkOpportunitiesTool.js'
import { backlinkOverviewTool } from '../domain/tools/backlinkOverviewTool.js'
import { domainOverviewTool } from '../domain/tools/domainOverviewTool.js'
import { domainTopPagesTool } from '../domain/tools/domainTopPagesTool.js'
import { keywordResearchTool } from '../domain/tools/keywordResearchTool.js'
import { projectsTool } from '../domain/tools/projectsTool.js'
import { seoOpportunitiesTool } from '../domain/tools/seoOpportunitiesTool.js'
import { siteAuditTool } from '../domain/tools/siteAuditTool.js'
import { subscriptionTool } from '../domain/tools/subscriptionTool.js'
import { trafficEstimationTool } from '../domain/tools/trafficEstimationTool.js'
import type { ToolContext } from './container.js'
import { NotFoundError } from '../utils/errors.js'

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: { parse: (value: unknown) => any }
  outputSchema: unknown
  execute: (input: any, context: ToolContext) => Promise<any>
}

const tools: ToolDefinition[] = [
  subscriptionTool,
  projectsTool,
  adminCreateInviteTool,
  domainOverviewTool,
  domainTopPagesTool,
  trafficEstimationTool,
  backlinkOverviewTool,
  backlinkOpportunitiesTool,
  keywordResearchTool,
  seoOpportunitiesTool,
  siteAuditTool,
  authReconnectTool,
  authLogoutTool,
]

const toolsByName = new Map(tools.map((tool) => [tool.name, tool]))

export function listToolDefinitions(): ToolDefinition[] {
  return tools
}

export async function invokeTool(name: string, rawInput: unknown, context: ToolContext): Promise<unknown> {
  const tool = toolsByName.get(name)
  if (!tool) {
    throw new NotFoundError(`Unknown tool: ${name}`)
  }

  const input = tool.inputSchema.parse(rawInput)
  return tool.execute(input, context)
}
