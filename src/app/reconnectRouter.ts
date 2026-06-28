import type { AppContainer } from './container.js'
import type { AuthenticatedPrincipal } from '../domain/types/oauth.js'
import type { BrowserBootstrapInput, RuntimeCookiesFormat } from '../domain/types/session.js'
import { AuthError } from '../utils/errors.js'
import { resolveOAuthUrls } from '../auth/oauthMetadata.js'
import { buildAuthorizeRequest } from './oauthRouter.js'

const connectFormSchema = {
  formats: ['auto', 'header', 'json', 'netscape'] as const,
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function renderPage(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,sans-serif;margin:0;padding:32px;background:#0f172a;color:#e2e8f0}.card{max-width:760px;margin:0 auto;background:#111827;border:1px solid #334155;border-radius:16px;padding:24px}h1{font-size:24px;margin-top:0}p,li{color:#cbd5e1}label{display:block;margin-bottom:8px;font-weight:600}input,select,textarea{width:100%;box-sizing:border-box;margin-bottom:16px;padding:12px;border-radius:10px;border:1px solid #475569;background:#020617;color:#e2e8f0}textarea{min-height:220px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}button{width:100%;padding:12px;border:0;border-radius:10px;background:#2563eb;color:white;font-weight:700;cursor:pointer}.error{margin-bottom:16px;padding:12px;border-radius:10px;background:#7f1d1d;color:#fecaca}.success{margin-bottom:16px;padding:12px;border-radius:10px;background:#14532d;color:#bbf7d0}.muted{font-size:14px;color:#94a3b8}code{color:#93c5fd}</style></head><body><div class="card">${body}</div></body></html>`
}

async function getFormParams(request: Request): Promise<Record<string, string>> {
  return Object.fromEntries(new URLSearchParams(await request.text()).entries())
}

function normalizePastedUrl(value: string): string {
  return value.replace(/\s+/g, '')
}

function renderConnectPage(code: string, values?: { cookies?: string; format?: RuntimeCookiesFormat }, errorMessage?: string): string {
  const currentFormat = values?.format ?? 'auto'
  const options = connectFormSchema.formats.map((format) => `<option value="${format}"${format === currentFormat ? ' selected' : ''}>${format}</option>`).join('')
  return renderPage('Connect Ubersuggest Cookies', `
    <h1>Connect Ubersuggest</h1>
    <p>Paste cookies from your logged-in Ubersuggest browser session, then start reconnect.</p>
    ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ''}
    <div class="success">Tip: you can paste raw <code>Cookie</code> header text, JSON cookies, or Netscape cookie exports.</div>
    <form method="post" action="/cookies">
      <input type="hidden" name="code" value="${escapeHtml(code)}" />
      <label for="cookieFile">Cookie file</label>
      <input id="cookieFile" type="file" accept=".txt,.json,.cookies" />
      <label for="format">Cookie format</label>
      <select id="format" name="format">${options}</select>
      <label for="cookies">Cookies</label>
      <textarea id="cookies" name="cookies" placeholder="Paste Cookie header, JSON cookies, or Netscape export here" required>${escapeHtml(values?.cookies ?? '')}</textarea>
      <button type="submit">Start reconnect</button>
    </form>
    <p class="muted">The file picker stays in the browser and loads the file into the textarea before submit.</p>
    <script>const fileInput=document.getElementById('cookieFile');const textarea=document.getElementById('cookies');fileInput?.addEventListener('change',async()=>{const file=fileInput.files?.[0];if(!file)return;textarea.value=await file.text();});</script>
  `)
}

function renderConnectResult(result: { sessionId: string; jobId: string; status: string }, statusUrl: string): string {
  return renderPage('Reconnect started', `
    <h1>Reconnect started</h1>
    <div class="success">Reconnect job queued successfully.</div>
    <p><strong>Session:</strong> <code>${escapeHtml(result.sessionId)}</code></p>
    <p><strong>Job ID:</strong> <code>${escapeHtml(result.jobId)}</code></p>
    <p><strong>Status:</strong> <code>${escapeHtml(result.status)}</code></p>
    <p>Poll status at <code>${escapeHtml(statusUrl)}</code> using your authenticated MCP client.</p>
  `)
}

export async function startReconnect(container: AppContainer, principal: AuthenticatedPrincipal, input: { authMode: 'profile'; profilePath: string; chromeProfileDirectory?: string } | { authMode?: 'cookies'; cookies: string; format?: RuntimeCookiesFormat }): Promise<{ sessionId: string; jobId: string; status: string }> {
  const context = container.createToolContext(principal)
  const reconnectInput: BrowserBootstrapInput = input.authMode === 'profile' ? { authMode: 'profile', profilePath: input.profilePath, chromeProfileDirectory: input.chromeProfileDirectory } : { authMode: 'cookies', cookies: { raw: input.cookies, format: input.format ?? 'auto' } }
  const job = await container.reconnectCoordinator.startManualReconnect(principal.subject, context.sessionId, reconnectInput)
  return { sessionId: context.sessionId, jobId: job.jobId, status: job.status }
}

export async function issueConnectCode(container: AppContainer, principal: AuthenticatedPrincipal) {
  return container.oauthIdentityService.createConnectCode(principal)
}

export async function renderConnectPageForCode(container: AppContainer, code: string, values?: { cookies?: string; format?: RuntimeCookiesFormat }, errorMessage?: string): Promise<string> {
  await container.oauthIdentityService.getConnectCode(code)
  return renderConnectPage(code, values, errorMessage)
}

export async function handleConnectSubmission(request: Request, container: AppContainer): Promise<string> {
  const fields = await getFormParams(request)
  const code = fields.code?.trim()
  const cookies = fields.cookies?.trim()
  const format = (fields.format?.trim() || 'auto') as RuntimeCookiesFormat
  if (!code) return renderPage('Connect unavailable', '<div class="error">Connect code is required.</div>')
  if (!connectFormSchema.formats.includes(format)) return renderConnectPageForCode(container, code, { cookies, format: 'auto' }, 'Cookie format is invalid.')
  if (!cookies) return renderConnectPageForCode(container, code, { cookies: '', format }, 'Cookies are required.')

  let principal
  try {
    principal = await container.oauthIdentityService.consumeConnectCode(code)
  } catch (error) {
    if (error instanceof AuthError) return renderPage('Connect unavailable', `<div class="error">${escapeHtml(error.message)}</div>`)
    throw error
  }

  const result = await startReconnect(container, principal, { authMode: 'cookies', cookies, format })
  const statusUrl = `${(container.config.publicBaseUrl ?? 'http://127.0.0.1:8787').replace(/\/$/, '')}/reconnect/${encodeURIComponent(result.jobId)}`
  return renderConnectResult(result, statusUrl)
}

export async function renderAuthHelperPage(errorMessage?: string, authorizeUrl = ''): Promise<string> {
  return renderPage('OAuth helper', `
    <h1>Open short login URL</h1>
    <p>If your terminal wraps the OAuth URL, paste it here and continue with a shorter browser URL.</p>
    ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ''}
    <form method="post" action="/auth">
      <label for="authorizeUrl">Full authorize URL</label>
      <textarea id="authorizeUrl" name="authorizeUrl" placeholder="Paste the full /a or /authorize URL here" required>${escapeHtml(authorizeUrl)}</textarea>
      <button type="submit">Open short login URL</button>
    </form>
  `)
}

export async function handleAuthHelperSubmission(request: Request, container: AppContainer): Promise<string> {
  const fields = await getFormParams(request)
  const authorizeUrl = fields.authorizeUrl?.trim()
  if (!authorizeUrl) return renderAuthHelperPage('Authorize URL is required.')
  const normalizedAuthorizeUrl = normalizePastedUrl(authorizeUrl)
  let url: URL
  try { url = new URL(normalizedAuthorizeUrl) } catch { return renderAuthHelperPage('Authorize URL is invalid.', authorizeUrl) }
  const urls = resolveOAuthUrls(request, container.config)
  if (url.origin !== urls.issuer || !['/a', '/authorize'].includes(url.pathname)) {
    return renderAuthHelperPage('Authorize URL must belong to this server.', authorizeUrl)
  }
  try {
    const result = await container.oauthIdentityService.createAuthorizeRequest(buildAuthorizeRequest(Object.fromEntries(url.searchParams.entries())))
    return result.authorizeUrl
  } catch {
    return renderAuthHelperPage('Authorize URL is invalid.', authorizeUrl)
  }
}

export async function getReconnectStatus(container: AppContainer, principal: AuthenticatedPrincipal, jobId: string): Promise<unknown> {
  return container.reconnectCoordinator.getJob(jobId, principal.subject)
}
