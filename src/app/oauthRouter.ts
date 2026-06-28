import { Buffer } from 'node:buffer'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { AppContainer } from './container.js'
import type { UbersuggestAwsConfig } from '../config/loadConfig.js'
import type { OAuthAuthorizationRequest, OAuthClientRegistration } from '../domain/types/oauth.js'
import { AuthError, InvalidRequestError } from '../utils/errors.js'
import { resolveOAuthUrls } from '../auth/oauthMetadata.js'
import { issueAccessToken, issueAuthorizationCode, verifyAuthorizationCode, verifyPkceCodeVerifier } from '../auth/oauthTokens.js'
import { createPrincipal } from '../auth/principal.js'
import type { OAuthInviteRecord } from '../stores/oauthIdentityStore.js'

const authorizeQuerySchema = z.object({
  response_type: z.literal('code'),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  state: z.string().optional(),
  scope: z.string().default('mcp:tools'),
  code_challenge: z.string().min(43),
  code_challenge_method: z.literal('S256'),
  resource: z.string().url().optional(),
})

const tokenRequestSchema = z.object({
  grant_type: z.literal('authorization_code'),
  code: z.string().min(1),
  redirect_uri: z.string().url(),
  client_id: z.string().min(1),
  code_verifier: z.string().min(43),
})

const registerRequestSchema = z.object({
  client_name: z.string().min(1).optional(),
  redirect_uris: z.array(z.string().url()).min(1),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.literal('none').optional(),
})

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

const tokenRevokeSchema = z.object({
  code: z.string().min(1),
  tokenId: z.string().min(1),
})

const inviteRedeemSchema = z.object({
  code: z.string().min(1),
  password: z.string().min(1),
  confirmPassword: z.string().min(1),
})

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function ensureSupportedRedirectUri(redirectUri: string): void {
  const url = new URL(redirectUri)
  const localhostHosts = new Set(['localhost', '127.0.0.1'])
  if (url.protocol === 'https:' || (url.protocol === 'http:' && localhostHosts.has(url.hostname))) {
    return
  }
  throw new InvalidRequestError('redirect_uri must be https or localhost/127.0.0.1 over http')
}

function ensureSupportedResource(resource: string | undefined, expectedResource: string): void {
  if (!resource || resource === expectedResource) {
    return
  }
  throw new InvalidRequestError('Requested resource is not supported')
}

function getBodyText(request: Request): Promise<string> {
  return request.text()
}

async function getFormParams(request: Request): Promise<Record<string, string>> {
  return Object.fromEntries(new URLSearchParams(await getBodyText(request)).entries())
}

function normalizeAuthorizeParams(query: Record<string, string | undefined>): Record<string, string | undefined> {
  return {
    ...query,
    state: query.state || undefined,
    resource: query.resource || undefined,
  }
}

function redirectWithParams(redirectUri: string, params: Record<string, string | undefined>): string {
  const url = new URL(redirectUri)
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value)
    }
  }
  return url.toString()
}

function renderPage(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,sans-serif;margin:0;padding:32px;background:#0f172a;color:#e2e8f0}.card{max-width:760px;margin:0 auto;background:#111827;border:1px solid #334155;border-radius:16px;padding:24px}h1{font-size:24px;margin-top:0}p,li{color:#cbd5e1}label{display:block;margin-bottom:8px;font-weight:600}input,select,textarea{width:100%;box-sizing:border-box;margin-bottom:16px;padding:12px;border-radius:10px;border:1px solid #475569;background:#020617;color:#e2e8f0}textarea{min-height:220px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}button{width:100%;padding:12px;border:0;border-radius:10px;background:#2563eb;color:white;font-weight:700;cursor:pointer}.error{margin-bottom:16px;padding:12px;border-radius:10px;background:#7f1d1d;color:#fecaca}.success{margin-bottom:16px;padding:12px;border-radius:10px;background:#14532d;color:#bbf7d0}.muted{font-size:14px;color:#94a3b8}code{color:#93c5fd}</style></head><body><div class="card">${body}</div></body></html>`
}

function renderOAuthLoginPage(authRequest: OAuthAuthorizationRequest, actionUrl: string, errorMessage?: string, authorizeCode?: string): string {
  const requestFields = authorizeCode
    ? `<input type="hidden" name="code" value="${escapeHtml(authorizeCode)}" />`
    : `<input type="hidden" name="response_type" value="code" />
        <input type="hidden" name="client_id" value="${escapeHtml(authRequest.clientId)}" />
        <input type="hidden" name="redirect_uri" value="${escapeHtml(authRequest.redirectUri)}" />
        <input type="hidden" name="scope" value="${escapeHtml(authRequest.scope)}" />
        <input type="hidden" name="code_challenge" value="${escapeHtml(authRequest.codeChallenge)}" />
        <input type="hidden" name="code_challenge_method" value="${escapeHtml(authRequest.codeChallengeMethod)}" />
        <input type="hidden" name="state" value="${escapeHtml(authRequest.state ?? '')}" />
        <input type="hidden" name="resource" value="${escapeHtml(authRequest.resource ?? '')}" />`

  return renderPage('Ubersuggest MCP Login', `
    <h1>Login to Ubersuggest MCP</h1>
    <p>Authenticate to bind this MCP connection to your own stored Ubersuggest session.</p>
    ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ''}
    <form method="post" action="${escapeHtml(actionUrl)}">
      ${requestFields}
      <label for="username">Username</label>
      <input id="username" name="username" autocomplete="username" required />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      <button type="submit">Authorize</button>
    </form>
    <p style="margin-top:16px">Requested scope: <code>${escapeHtml(authRequest.scope)}</code></p>
  `)
}

function renderDirectLoginPage(actionUrl: string, errorMessage?: string): string {
  return renderPage('Ubersuggest MCP Login', `
    <h1>Login to Ubersuggest MCP</h1>
    <p>Login in browser to get a reusable MCP bearer token for your agent config, then connect your Ubersuggest cookies in the same flow.</p>
    ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ''}
    <form method="post" action="${escapeHtml(actionUrl)}">
      <label for="username">Username</label>
      <input id="username" name="username" autocomplete="username" required />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      <button type="submit">Create MCP token</button>
    </form>
    <p class="muted">Need OAuth client login instead? Existing <code>/authorize</code> and <code>/a</code> routes still work.</p>
  `)
}

function renderBrowserSetupPage(input: {
  token: string
  manageUrl: string
  cookiesUrl: string
  connectCode: string
  cookieFormats: readonly string[]
}): string {
  const options = input.cookieFormats.map((format) => `<option value="${escapeHtml(format)}">${escapeHtml(format)}</option>`).join('')
  return renderPage('Browser setup ready', `
    <h1>Browser setup ready</h1>
    <div class="success">Your MCP bearer token is ready. Copy it now and store it in <code>.env</code> or your agent secret store — this page is the only time the raw token is shown.</div>
    <label for="token">MCP bearer token</label>
    <textarea id="token" readonly>${escapeHtml(input.token)}</textarea>
    <p class="muted">Example: <code>MCP_BEARER_TOKEN=${escapeHtml(input.token)}</code></p>
    <p><a href="${escapeHtml(input.manageUrl)}">Manage tokens</a> · <a href="${escapeHtml(input.cookiesUrl)}">Open cookie helper</a></p>
    <h2>Connect Ubersuggest cookies</h2>
    <form method="post" action="/cookies">
      <input type="hidden" name="code" value="${escapeHtml(input.connectCode)}" />
      <label for="cookieFile">Cookie file</label>
      <input id="cookieFile" type="file" accept=".txt,.json,.cookies" />
      <label for="format">Cookie format</label>
      <select id="format" name="format">${options}</select>
      <label for="cookies">Cookies</label>
      <textarea id="cookies" name="cookies" placeholder="Paste Cookie header, JSON cookies, or Netscape export here" required></textarea>
      <button type="submit">Start reconnect</button>
    </form>
    <p class="muted">The file picker stays in the browser and loads the file into the textarea before submit.</p>
    <script>const fileInput=document.getElementById('cookieFile');const textarea=document.getElementById('cookies');fileInput?.addEventListener('change',async()=>{const file=fileInput.files?.[0];if(!file)return;textarea.value=await file.text();});</script>
  `)
}

function renderTokensPage(input: {
  code: string
  createUrl: string
  tokens: Array<{ tokenId: string; label?: string; createdAt: number; lastUsedAt?: number; status: string }>
  errorMessage?: string
  successMessage?: string
}): string {
  const rows = input.tokens.length
    ? input.tokens.map((token) => `
        <tr>
          <td><code>${escapeHtml(token.tokenId)}</code></td>
          <td>${escapeHtml(token.label ?? '-')}</td>
          <td>${new Date(token.createdAt).toISOString()}</td>
          <td>${token.lastUsedAt ? new Date(token.lastUsedAt).toISOString() : '-'}</td>
          <td>${escapeHtml(token.status)}</td>
          <td>
            ${token.status === 'active' ? `
            <form method="post" action="/tokens" style="margin:0">
              <input type="hidden" name="action" value="revoke" />
              <input type="hidden" name="code" value="${escapeHtml(input.code)}" />
              <input type="hidden" name="tokenId" value="${escapeHtml(token.tokenId)}" />
              <button type="submit">Revoke</button>
            </form>` : '-'}
          </td>
        </tr>`).join('')
    : '<tr><td colspan="6">No tokens yet.</td></tr>'

  return renderPage('Manage MCP tokens', `
    <h1>Manage MCP tokens</h1>
    ${input.errorMessage ? `<div class="error">${escapeHtml(input.errorMessage)}</div>` : ''}
    ${input.successMessage ? `<div class="success">${escapeHtml(input.successMessage)}</div>` : ''}
    <form method="post" action="/tokens">
      <input type="hidden" name="action" value="create" />
      <input type="hidden" name="code" value="${escapeHtml(input.code)}" />
      <label for="label">New token label</label>
      <input id="label" name="label" placeholder="optional label" />
      <button type="submit">Create another token</button>
    </form>
    <p class="muted">New tokens are shown once on creation. Existing raw tokens cannot be viewed again, so rotate by creating a new one before revoking the old one.</p>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr><th align="left">Token ID</th><th align="left">Label</th><th align="left">Created</th><th align="left">Last used</th><th align="left">Status</th><th align="left">Action</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p><a href="${escapeHtml(input.createUrl)}">Refresh</a></p>
  `)
}

function renderInvitePage(invite: OAuthInviteRecord, code: string, passwordMinLength: number, errorMessage?: string): string {
  return renderPage('Redeem Ubersuggest MCP Invite', `
    <h1>Redeem invite</h1>
    <p>Create your password for <code>${escapeHtml(invite.username)}</code>.</p>
    ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ''}
    <form method="post" action="/invite">
      <input type="hidden" name="code" value="${escapeHtml(code)}" />
      <label for="username">Username</label>
      <input id="username" value="${escapeHtml(invite.username)}" readonly />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="new-password" required minlength="${passwordMinLength}" />
      <label for="confirmPassword">Confirm password</label>
      <input id="confirmPassword" name="confirmPassword" type="password" autocomplete="new-password" required minlength="${passwordMinLength}" />
      <button type="submit">Create account</button>
    </form>
  `)
}

function renderInviteMessagePage(title: string, message: string, success = false): string {
  const messageClass = success ? 'success' : 'error'
  const followUpMessage = success ? 'Return to your MCP client and sign in through the normal OAuth login page.' : 'Ask your admin to generate a fresh invite if you still need access.'
  return renderPage(title, `<h1>${escapeHtml(title)}</h1><div class="${messageClass}">${escapeHtml(message)}</div><p>${followUpMessage}</p>`)
}

export function buildAuthorizeRequest(query: Record<string, string | undefined>): OAuthAuthorizationRequest {
  const parsed = authorizeQuerySchema.safeParse(normalizeAuthorizeParams(query))
  if (!parsed.success) {
    throw new InvalidRequestError(parsed.error.issues[0]?.message ?? 'Authorize query is invalid')
  }
  ensureSupportedRedirectUri(parsed.data.redirect_uri)
  return {
    clientId: parsed.data.client_id,
    redirectUri: parsed.data.redirect_uri,
    state: parsed.data.state,
    scope: parsed.data.scope,
    codeChallenge: parsed.data.code_challenge,
    codeChallengeMethod: parsed.data.code_challenge_method,
    resource: parsed.data.resource,
  }
}

export function getProtectedResourceMetadata(request: Request, config: UbersuggestAwsConfig) {
  const urls = resolveOAuthUrls(request, config)
  return {
    resource: urls.resource,
    authorization_servers: [urls.issuer],
    scopes_supported: ['mcp:tools'],
    bearer_methods_supported: ['header'],
  }
}

export function getAuthorizationServerMetadata(request: Request, config: UbersuggestAwsConfig) {
  const urls = resolveOAuthUrls(request, config)
  return {
    issuer: urls.issuer,
    authorization_endpoint: urls.authorizeUrl,
    token_endpoint: urls.tokenUrl,
    registration_endpoint: urls.registrationUrl,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp:tools'],
    response_modes_supported: ['query'],
    client_id_metadata_document_supported: false,
  }
}

export function getOpenIdConfiguration(request: Request, config: UbersuggestAwsConfig) {
  return getAuthorizationServerMetadata(request, config)
}

export async function startDynamicClientRegistration(request: Request) {
  const parsed = registerRequestSchema.safeParse(JSON.parse((await getBodyText(request)) || '{}'))
  if (!parsed.success) {
    throw new AuthError(parsed.error.issues[0]?.message ?? 'Client registration payload is invalid')
  }
  for (const redirectUri of parsed.data.redirect_uris) {
    ensureSupportedRedirectUri(redirectUri)
  }
  const clientId = randomBytes(12).toString('base64url')
  const registered: OAuthClientRegistration = {
    client_name: parsed.data.client_name,
    redirect_uris: parsed.data.redirect_uris,
    grant_types: parsed.data.grant_types ?? ['authorization_code'],
    response_types: parsed.data.response_types ?? ['code'],
    token_endpoint_auth_method: 'none',
  }
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    ...registered,
  }
}

export async function renderAuthorizeLogin(request: Request, config: UbersuggestAwsConfig, container: AppContainer): Promise<string | { redirectUrl: string }> {
  const urls = resolveOAuthUrls(request, config)
  const url = new URL(request.url)
  const code = url.searchParams.get('code')?.trim()
  const hasOAuthParams = url.searchParams.has('response_type') || url.searchParams.has('client_id') || url.searchParams.has('redirect_uri') || url.searchParams.has('code_challenge')

  if (!code && !hasOAuthParams && url.pathname === '/login') {
    return renderDirectLoginPage(urls.authorizeUrl)
  }

  if (code) {
    const authorizeRequest = await container.oauthIdentityService.getAuthorizeRequest(code)
    return renderOAuthLoginPage(authorizeRequest.authRequest, urls.authorizeUrl, undefined, code)
  }

  const authRequest = buildAuthorizeRequest(Object.fromEntries(url.searchParams.entries()))
  ensureSupportedResource(authRequest.resource, urls.resource)
  const authorizeRequest = await container.oauthIdentityService.createAuthorizeRequest(authRequest)
  return { redirectUrl: authorizeRequest.authorizeUrl }
}

export async function handleAuthorize(request: Request, config: UbersuggestAwsConfig, container: AppContainer): Promise<string> {
  const urls = resolveOAuthUrls(request, config)
  const fields = await getFormParams(request)
  const authorizeCode = fields.code?.trim()
  const isOAuthFlow = Boolean(authorizeCode || fields.response_type || fields.client_id || fields.redirect_uri || fields.code_challenge)

  const credentials = loginSchema.safeParse(fields)
  if (!credentials.success) {
    if (isOAuthFlow) {
      const authRequest = authorizeCode ? (await container.oauthIdentityService.getAuthorizeRequest(authorizeCode)).authRequest : buildAuthorizeRequest(fields)
      return renderOAuthLoginPage(authRequest, urls.authorizeUrl, 'Username and password are required.', authorizeCode)
    }
    return renderDirectLoginPage(urls.authorizeUrl, 'Username and password are required.')
  }

  let principal
  try {
    principal = await container.oauthIdentityService.authenticateLogin(credentials.data.username, credentials.data.password)
  } catch (error) {
    if (error instanceof AuthError) {
      if (isOAuthFlow) {
        const authRequest = authorizeCode ? (await container.oauthIdentityService.getAuthorizeRequest(authorizeCode)).authRequest : buildAuthorizeRequest(fields)
        return renderOAuthLoginPage(authRequest, urls.authorizeUrl, error.message, authorizeCode)
      }
      return renderDirectLoginPage(urls.authorizeUrl, error.message)
    }
    throw error
  }

  const resolvedPrincipal = createPrincipal(principal.username)

  if (!isOAuthFlow) {
    const issuedToken = await container.oauthIdentityService.issueMcpBearerToken(resolvedPrincipal)
    const connect = await container.oauthIdentityService.createConnectCode(resolvedPrincipal)
    const manageCode = await container.oauthIdentityService.createManageCode(resolvedPrincipal)
    return renderBrowserSetupPage({
      token: issuedToken.token,
      manageUrl: `${urls.issuer}/tokens?code=${encodeURIComponent(manageCode)}`,
      cookiesUrl: connect.connectUrl,
      connectCode: connect.connectCode,
      cookieFormats: ['auto', 'header', 'json', 'netscape'],
    })
  }

  const authorizeRequest = authorizeCode ? await container.oauthIdentityService.getAuthorizeRequest(authorizeCode) : undefined
  const authRequest = authorizeRequest?.authRequest ?? buildAuthorizeRequest(fields)
  ensureSupportedResource(authRequest.resource, urls.resource)

  if (authorizeCode) {
    await container.oauthIdentityService.consumeAuthorizeRequest(authorizeCode)
  }

  const authorizationCode = issueAuthorizationCode({
    iss: urls.issuer,
    aud: urls.resource,
    sub: resolvedPrincipal.subject,
    username: resolvedPrincipal.username,
    scope: authRequest.scope,
    client_id: authRequest.clientId,
    redirect_uri: authRequest.redirectUri,
    code_challenge: authRequest.codeChallenge,
    code_challenge_method: authRequest.codeChallengeMethod,
    resource: authRequest.resource,
  }, config.oauthSigningSecret, config.oauthAuthorizationCodeTtlSeconds)

  const now = Date.now()
  const codeId = parseCodeId(authorizationCode)
  await container.authorizationCodeStore.createCode({
    codeId,
    clientId: authRequest.clientId,
    redirectUri: authRequest.redirectUri,
    subject: resolvedPrincipal.subject,
    createdAt: now,
    expiresAt: now + config.oauthAuthorizationCodeTtlSeconds * 1000,
  })

  return redirectWithParams(authRequest.redirectUri, { code: authorizationCode, state: authRequest.state })
}

function parseCodeId(code: string): string {
  const parts = code.split('.')
  if (parts.length !== 3) {
    throw new AuthError('Token format is invalid')
  }
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { iat?: number; client_id?: string }
  if (!payload.iat || !payload.client_id) {
    throw new AuthError('Authorization code payload is invalid')
  }
  return `${payload.client_id}:${payload.iat}:${parts[2]}`
}

export async function exchangeAuthorizationCode(request: Request, config: UbersuggestAwsConfig, container: AppContainer) {
  const parsed = tokenRequestSchema.safeParse(await getFormParams(request))
  if (!parsed.success) {
    throw new InvalidRequestError(parsed.error.issues[0]?.message ?? 'Token request is invalid')
  }
  const urls = resolveOAuthUrls(request, config)
  const claims = verifyAuthorizationCode(parsed.data.code, config.oauthSigningSecret, parsed.data.client_id, parsed.data.redirect_uri)
  const codeRecord = await container.authorizationCodeStore.consumeCode(parseCodeId(parsed.data.code))
  if (!codeRecord) {
    throw new AuthError('Authorization code is invalid or already used')
  }
  if (codeRecord.clientId !== parsed.data.client_id || codeRecord.redirectUri !== parsed.data.redirect_uri || codeRecord.subject !== claims.sub) {
    throw new AuthError('Authorization code record does not match request')
  }
  if (codeRecord.expiresAt <= Date.now()) {
    throw new AuthError('Authorization code has expired')
  }
  if (!verifyPkceCodeVerifier(parsed.data.code_verifier, claims.code_challenge)) {
    throw new AuthError('code_verifier does not match code_challenge')
  }
  return {
    access_token: issueAccessToken({ iss: urls.issuer, aud: urls.resource, sub: claims.sub, username: claims.username, scope: claims.scope }, config.oauthSigningSecret, config.oauthAccessTokenTtlSeconds),
    token_type: 'Bearer',
    expires_in: config.oauthAccessTokenTtlSeconds,
    scope: claims.scope,
  }
}

async function renderInvitePageForCode(container: AppContainer, code: string, errorMessage?: string): Promise<string> {
  const invite = await container.oauthIdentityService.getInvite(code)
  return renderInvitePage(invite, code, container.config.oauthPasswordMinLength, errorMessage)
}

export async function renderInviteRedemption(request: Request, container: AppContainer): Promise<string> {
  const code = new URL(request.url).searchParams.get('code')?.trim()
  if (!code) {
    return renderInviteMessagePage('Invite unavailable', 'Invite code is required.')
  }
  try {
    return await renderInvitePageForCode(container, code)
  } catch (error) {
    if (error instanceof AuthError) {
      return renderInviteMessagePage('Invite unavailable', error.message)
    }
    throw error
  }
}

export async function handleInviteRedemption(request: Request, container: AppContainer): Promise<string> {
  const fields = await getFormParams(request)
  const parsed = inviteRedeemSchema.safeParse(fields)
  if (!parsed.success) {
    return renderInviteMessagePage('Invite unavailable', parsed.error.issues[0]?.message ?? 'Invite form is invalid.')
  }
  const { code, password, confirmPassword } = parsed.data
  if (password !== confirmPassword) {
    return renderInvitePageForCode(container, code, 'Passwords do not match')
  }
  try {
    const result = await container.oauthIdentityService.redeemInvite(code, password)
    return renderInviteMessagePage('Invite redeemed', `Account ${result.username} is ready.`, true)
  } catch (error) {
    if (error instanceof AuthError) {
      return renderInvitePageForCode(container, code, error.message)
    }
    throw error
  }
}

export async function renderTokens(request: Request, config: UbersuggestAwsConfig, container: AppContainer, errorMessage?: string, successMessage?: string): Promise<string> {
  const urls = resolveOAuthUrls(request, config)
  const code = new URL(request.url).searchParams.get('code')?.trim()
  if (!code) {
    return renderPage('Manage MCP tokens', '<div class="error">Manage code is required.</div>')
  }
  const manageCode = await container.oauthIdentityService.getManageCode(code)
  const principal = createPrincipal(manageCode.username)
  const tokens = await container.oauthIdentityService.listMcpBearerTokens(principal)
  return renderTokensPage({
    code,
    createUrl: `${urls.issuer}/tokens?code=${encodeURIComponent(code)}`,
    tokens: tokens.map((token) => ({ tokenId: token.tokenId, label: token.label, createdAt: token.createdAt, lastUsedAt: token.lastUsedAt, status: token.status })),
    errorMessage,
    successMessage,
  })
}

export async function handleTokens(request: Request, config: UbersuggestAwsConfig, container: AppContainer): Promise<string> {
  const fields = await getFormParams(request)
  const action = fields.action?.trim() || 'create'
  const code = fields.code?.trim()
  if (!code) {
    return renderPage('Manage MCP tokens', '<div class="error">Manage code is required.</div>')
  }

  const manageCode = await container.oauthIdentityService.getManageCode(code)
  const principal = createPrincipal(manageCode.username)

  if (action === 'revoke') {
    const parsed = tokenRevokeSchema.safeParse(fields)
    if (!parsed.success) {
      return renderTokens(request, config, container, parsed.error.issues[0]?.message ?? 'Token revoke request is invalid.')
    }
    await container.oauthIdentityService.revokeMcpBearerToken(principal, parsed.data.tokenId)
    return renderTokens(request, config, container, undefined, 'Token revoked.')
  }

  const label = fields.label?.trim() || undefined
  const issuedToken = await container.oauthIdentityService.issueMcpBearerToken(principal, label)
  return renderPage('New MCP token created', `
    <h1>New MCP token created</h1>
    <div class="success">Copy this token now. It will not be shown again.</div>
    <textarea readonly>${escapeHtml(issuedToken.token)}</textarea>
    <p class="muted">Example: <code>MCP_BEARER_TOKEN=${escapeHtml(issuedToken.token)}</code></p>
    <p><a href="${escapeHtml(`${resolveOAuthUrls(request, config).issuer}/tokens?code=${encodeURIComponent(code)}`)}">Back to token list</a></p>
  `)
}
