import { createContainer } from '../app/container.js'
import { invokeTool, listToolDefinitions } from '../app/toolRegistry.js'
import { resolveOAuthUrls } from '../auth/oauthMetadata.js'
import { buildWwwAuthenticateHeader, requirePrincipal } from '../auth/requestAuth.js'
import { AuthError, ReconnectRequiredError, UbersuggestError } from '../utils/errors.js'
import type { CloudflareBindings } from '../config/loadConfig.js'

export async function handleInvokeTool(request: Request, env: CloudflareBindings): Promise<Response> {
  const container = createContainer(env)

  try {
    const principal = await requirePrincipal(request, container.config)
    container.logger.diagnostic(container.config.diagnosticLogging, request, 'invoke-tool', 'Invoke-tool endpoint hit', {
      subject: principal.subject,
    })

    if (request.method === 'GET') {
      return Response.json({
        tools: listToolDefinitions().map((tool) => ({
          name: tool.name,
          description: tool.description,
        })),
      })
    }

    const body = await request.json<{ tool: string; input?: unknown }>()
    const context = container.createToolContext(principal)
    const result = await invokeTool(body.tool, body.input ?? {}, context)
    return Response.json({ ok: true, result })
  } catch (error) {
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

    container.logger.error('Tool invocation failed', {
      error: error instanceof Error ? error.message : String(error),
    })

    if (error instanceof ReconnectRequiredError) {
      return Response.json({
        ok: false,
        code: error.name,
        sessionId: error.sessionId,
        message: error.message,
      }, { status: 409 })
    }

    if (error instanceof UbersuggestError) {
      return Response.json({
        ok: false,
        code: error.name,
        message: error.message,
      }, { status: 400 })
    }

    return Response.json({
      ok: false,
      code: 'InternalError',
      message: 'Tool invocation failed. Check server logs and retry.',
    }, { status: 500 })
  }
}
