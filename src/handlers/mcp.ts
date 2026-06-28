import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createContainer } from '../app/container.js'
import type { ToolContext } from '../app/container.js'
import type { ToolDefinition } from '../app/toolRegistry.js'
import { listToolDefinitions } from '../app/toolRegistry.js'
import { resolveOAuthUrls } from '../auth/oauthMetadata.js'
import { buildWwwAuthenticateHeader, requirePrincipal } from '../auth/requestAuth.js'
import { AuthError } from '../utils/errors.js'
import type { CloudflareBindings } from '../config/loadConfig.js'

function createMcpServer(context: ToolContext): McpServer {
  const server = new McpServer(
    {
      name: 'ubersuggest-mcp-cf',
      version: '0.1.0',
    },
    {
      capabilities: {
        logging: {},
      },
    },
  )

  for (const tool of listToolDefinitions()) {
    registerTool(server, tool, context)
  }

  return server
}

function registerTool(server: McpServer, tool: ToolDefinition, context: ToolContext): void {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.inputSchema as any,
      outputSchema: tool.outputSchema as any,
    },
    async (input: any) => {
      const result = await tool.execute(input, context)
      const hasMarkdown = result && typeof result === 'object' && 'markdownSummary' in result
      return {
        structuredContent: result,
        content: [
          {
            type: 'text' as const,
            text: hasMarkdown ? result.markdownSummary : JSON.stringify(result, null, 2),
          },
        ],
      }
    },
  )
}

export async function handleMcp(request: Request, env: CloudflareBindings): Promise<Response> {
  const container = createContainer(env)
  let server: McpServer | undefined
  let transport: WebStandardStreamableHTTPServerTransport | undefined

  try {
    const principal = await requirePrincipal(request, container.config)
    container.logger.diagnostic(container.config.diagnosticLogging, request, 'mcp', 'MCP endpoint hit', {
      subject: principal.subject,
    })
    const context = container.createToolContext(principal)
    server = createMcpServer(context)
    transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: container.config.enableJsonResponse,
    })

    await server.connect(transport)
    const response = await transport.handleRequest(request)

    if (request.method === 'GET') {
      return response
    }

    await transport.close().catch(() => undefined)
    await server.close().catch(() => undefined)
    return response
  } catch (error) {
    await transport?.close().catch(() => undefined)
    await server?.close().catch(() => undefined)

    if (error instanceof AuthError) {
      const urls = resolveOAuthUrls(request, container.config)
      return Response.json({
        error: error.message === 'Missing bearer token' ? 'invalid_request' : 'invalid_token',
        error_description: error.message,
      }, {
        status: 401,
        headers: {
          'www-authenticate': buildWwwAuthenticateHeader(urls.protectedResourceMetadataUrl),
        },
      })
    }

    container.logger.error('MCP request failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({
      ok: false,
      message: 'MCP request failed. Check server logs and retry.',
    }, { status: 500 })
  }
}
