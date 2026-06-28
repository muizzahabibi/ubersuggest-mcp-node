import type { CloudflareBindings } from '../config/loadConfig.js'
import { handleAuthHelper } from '../handlers/authHelper.js'
import { handleAuthorizeRoute } from '../handlers/authorize.js'
import { handleConnect } from '../handlers/connect.js'
import { handleGuide } from '../handlers/guide.js'
import { handleHealth } from '../handlers/health.js'
import { handleHelp } from '../handlers/help.js'
import { handleInvite } from '../handlers/invite.js'
import { handleInvokeTool } from '../handlers/invokeTool.js'
import { handleLogout } from '../handlers/logout.js'
import { handleMcp } from '../handlers/mcp.js'
import { handleOAuthAuthorizationServer } from '../handlers/oauthAuthorizationServer.js'
import { handleOAuthProtectedResource } from '../handlers/oauthProtectedResource.js'
import { handleReconnectStart } from '../handlers/reconnectStart.js'
import { handleReconnectStatus } from '../handlers/reconnectStatus.js'
import { handleRegister } from '../handlers/register.js'
import { handleToken } from '../handlers/token.js'
import { handleTokensRoute } from '../handlers/tokens.js'

export async function routeRequest(request: Request, env: CloudflareBindings): Promise<Response> {
  const url = new URL(request.url)

  if (url.pathname === '/health' && request.method === 'GET') {
    return handleHealth(env)
  }

  if (url.pathname === '/help' && request.method === 'GET') {
    return handleHelp(request, env)
  }

  if (url.pathname === '/guide' && request.method === 'GET') {
    return handleGuide(request, env)
  }

  if (url.pathname === '/.well-known/oauth-protected-resource' && request.method === 'GET') {
    return handleOAuthProtectedResource(request, env)
  }

  if ((url.pathname === '/.well-known/oauth-authorization-server' || url.pathname === '/.well-known/openid-configuration') && request.method === 'GET') {
    return handleOAuthAuthorizationServer(request, env)
  }

  if (url.pathname === '/login' || url.pathname === '/a' || url.pathname === '/authorize') {
    return handleAuthorizeRoute(request, env)
  }

  if ((url.pathname === '/t' || url.pathname === '/token')) {
    return handleToken(request, env)
  }

  if ((url.pathname === '/r' || url.pathname === '/register')) {
    return handleRegister(request, env)
  }

  if (url.pathname === '/tokens') {
    return handleTokensRoute(request, env)
  }

  if (url.pathname === '/invite') {
    return handleInvite(request, env)
  }

  if (url.pathname === '/cookies' || url.pathname === '/connect') {
    return handleConnect(request, env)
  }

  if (url.pathname === '/auth') {
    return handleAuthHelper(request, env)
  }

  if (url.pathname === '/invoke-tool') {
    return handleInvokeTool(request, env)
  }

  if (url.pathname === '/mcp') {
    return handleMcp(request, env)
  }

  if (url.pathname === '/reconnect' && (request.method === 'GET' || request.method === 'POST')) {
    return handleReconnectStart(request, env)
  }

  if (url.pathname.startsWith('/reconnect/') && request.method === 'GET') {
    const jobId = url.pathname.slice('/reconnect/'.length)
    return handleReconnectStatus(request, env, jobId)
  }

  if (url.pathname === '/logout' && request.method === 'POST') {
    return handleLogout(request, env)
  }

  return Response.json({ ok: false, message: 'Not found' }, { status: 404 })
}
