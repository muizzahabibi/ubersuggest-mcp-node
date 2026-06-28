import { chromium } from 'playwright'
import type { Browser, BrowserContext, Cookie, Page } from 'playwright'
import { BootstrapValidator } from '../auth/bootstrapValidator.js'
import { FEATURE_REFERERS } from '../client/endpointCatalog.js'
import { AuthBootstrapError } from '../utils/errors.js'
import type { BrowserBootstrapInput, BrowserBootstrapResult, FeatureName, CookiesFormat, RuntimeCookiesFormat } from '../domain/types/session.js'

const DEFAULT_COOKIE_PATH = '/'
const DEFAULT_COOKIE_EXPIRY = -1
const DEFAULT_COOKIE_SAME_SITE: Cookie['sameSite'] = 'Lax'

export function parseRuntimeCookies(raw: string, format: RuntimeCookiesFormat, baseUrl: string): Cookie[] {
  return parseCookies(raw, resolveCookieFormat(raw, format), baseUrl)
}

function parseCookies(raw: string, format: CookiesFormat, baseUrl: string): Cookie[] {
  switch (format) {
    case 'json':
      return parseJsonCookies(raw, baseUrl)
    case 'netscape':
      return parseNetscapeCookies(raw)
    case 'header':
      return parseCookieHeader(raw, baseUrl)
    default:
      throw new AuthBootstrapError(`Unsupported cookie format: ${String(format)}`)
  }
}

function resolveCookieFormat(raw: string, format: RuntimeCookiesFormat): CookiesFormat {
  if (format !== 'auto') {
    return format
  }

  const trimmed = raw.trim()
  if (!trimmed) {
    throw new AuthBootstrapError('No cookies were provided for runtime reconnect')
  }

  if (trimmed.startsWith('[')) {
    return 'json'
  }

  if (trimmed.includes('\t')) {
    return 'netscape'
  }

  return 'header'
}

function parseJsonCookies(raw: string, baseUrl: string): Cookie[] {
  const hostname = new URL(baseUrl).hostname
  const parsed = JSON.parse(raw) as Array<Record<string, unknown>>

  return parsed.map((cookie) => ({
    name: String(cookie.name),
    value: String(cookie.value),
    domain: typeof cookie.domain === 'string' ? cookie.domain : hostname,
    path: typeof cookie.path === 'string' ? cookie.path : DEFAULT_COOKIE_PATH,
    expires: typeof cookie.expires === 'number' ? cookie.expires : DEFAULT_COOKIE_EXPIRY,
    httpOnly: Boolean(cookie.httpOnly),
    secure: cookie.secure === undefined ? true : Boolean(cookie.secure),
    sameSite: normalizeSameSite(cookie.sameSite),
  }))
}

function parseNetscapeCookies(raw: string): Cookie[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))

  return lines.map((line) => {
    const [domain, , path, secureFlag, expires, name, value] = line.split('\t')
    if (!domain || !path || !secureFlag || !expires || !name || value === undefined) {
      throw new AuthBootstrapError('Invalid Netscape cookie line format')
    }

    return {
      name,
      value,
      domain,
      path,
      expires: Number(expires),
      httpOnly: false,
      secure: secureFlag.toUpperCase() === 'TRUE',
      sameSite: DEFAULT_COOKIE_SAME_SITE,
    }
  })
}

function parseCookieHeader(raw: string, baseUrl: string): Cookie[] {
  const hostname = new URL(baseUrl).hostname
  const parts = raw.split(';').map((part) => part.trim()).filter(Boolean)

  return parts.map((part) => {
    const separatorIndex = part.indexOf('=')
    if (separatorIndex === -1) {
      throw new AuthBootstrapError('Invalid cookie header segment format')
    }

    return {
      name: part.slice(0, separatorIndex),
      value: part.slice(separatorIndex + 1),
      domain: hostname,
      path: DEFAULT_COOKIE_PATH,
      expires: DEFAULT_COOKIE_EXPIRY,
      httpOnly: false,
      secure: true,
      sameSite: DEFAULT_COOKIE_SAME_SITE,
    }
  })
}

function normalizeSameSite(value: unknown): Cookie['sameSite'] {
  if (value === 'Strict' || value === 'Lax' || value === 'None') {
    return value
  }
  return DEFAULT_COOKIE_SAME_SITE
}

export interface CapturedRuntimeHeaders {
  cookiesHeader: string
  authorizationBearer: string
  xUbsData: string
  ts?: string
  referer?: string
  observedUserUrl?: string
  observedGetTokenUrl?: string
}

async function captureRuntimeHeaders(
  page: Page,
  context: BrowserContext,
  action: () => Promise<void>,
  timeoutMs: number,
  logger: any,
): Promise<CapturedRuntimeHeaders> {
  const captured: Partial<CapturedRuntimeHeaders> = {}

  function onRequest(request: any): void {
    const url = request.url()
    const parsed = new URL(url)
    const pathname = parsed.pathname.startsWith('/api/') ? parsed.pathname : undefined
    if (!pathname) {
      return
    }

    const headers = request.headers()
    captured.authorizationBearer ??= headers.authorization
    captured.xUbsData ??= headers['x-ubs-data']
    captured.ts ??= headers.ts
    captured.referer ??= headers.referer
    captured.cookiesHeader ??= headers.cookie

    if (pathname === '/api/user') {
      captured.observedUserUrl ??= url
    }
    if (pathname === '/api/get_token') {
      captured.observedGetTokenUrl ??= url
    }
  }

  page.on('request', onRequest)
  let actionError: any = null
  try {
    await action()
  } catch (err) {
    actionError = err
    logger.error('Error during browser navigation action', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    })
  } finally {
    page.off('request', onRequest)
  }

  if (actionError) {
    throw actionError
  }

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (captured.authorizationBearer && captured.xUbsData) {
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  if (!captured.cookiesHeader) {
    const cookies = await context.cookies()
    if (cookies.length > 0) {
      logger.warn('Runtime header capture fell back to serialized browser cookies', {
        cookieCount: cookies.length,
      })
      captured.cookiesHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
    }
  }

  if (!captured.authorizationBearer || !captured.xUbsData || !captured.cookiesHeader) {
    const currentUrl = page.url()
    logger.error('Runtime header capture failed', {
      currentUrl,
      hasAuthorization: Boolean(captured.authorizationBearer),
      hasXUbsData: Boolean(captured.xUbsData),
      hasCookies: Boolean(captured.cookiesHeader),
      observedUserUrl: captured.observedUserUrl,
      observedGetTokenUrl: captured.observedGetTokenUrl,
    })
    throw new AuthBootstrapError(`Failed to capture Authorization, X-UBS-Data, and cookies from the browser session. Current URL: ${currentUrl}`)
  }

  return {
    cookiesHeader: captured.cookiesHeader,
    authorizationBearer: captured.authorizationBearer,
    xUbsData: captured.xUbsData,
    ts: captured.ts,
    referer: captured.referer,
    observedUserUrl: captured.observedUserUrl,
    observedGetTokenUrl: captured.observedGetTokenUrl,
  }
}

class LocalBrowserSession {
  private browser?: Browser
  private context?: BrowserContext
  private page?: Page

  constructor(
    private readonly config: any,
    private readonly logger: any,
    private readonly input: BrowserBootstrapInput,
  ) {}

  async start(): Promise<{ context: BrowserContext; page: Page }> {
    if (this.context && this.page) {
      return { context: this.context, page: this.page }
    }

    const headless = process.env.UBERSUGGEST_HEADLESS !== 'false'
    const channel = (process.env.UBERSUGGEST_BROWSER_CHANNEL as any) || undefined

    if (this.input.authMode === 'profile') {
      this.context = await chromium.launchPersistentContext(this.input.profilePath, {
        channel,
        headless,
        args: this.input.chromeProfileDirectory
          ? [`--profile-directory=${this.input.chromeProfileDirectory}`]
          : [],
      })
      this.page = this.context.pages()[0] ?? (await this.context.newPage())
      return { context: this.context, page: this.page }
    }

    const cookies = parseRuntimeCookies(this.input.cookies.raw, this.input.cookies.format, this.config.baseUrl)
    this.browser = await chromium.launch({
      channel,
      headless,
    })
    this.context = await this.browser.newContext()
    if (cookies.length > 0) {
      await this.context.addCookies(cookies)
    }
    this.page = await this.context.newPage()
    return { context: this.context, page: this.page }
  }

  async navigateForFeature(feature: FeatureName): Promise<Page> {
    const { page } = await this.start()
    const path = feature === 'bootstrap' ? this.config.bootstrapPath : FEATURE_REFERERS[feature]
    const url = new URL(path, this.config.baseUrl).toString()

    this.logger.debug('Navigating browser for feature bootstrap', { feature, url })
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: this.config.requestTimeoutMs,
    })

    try {
      await page.waitForLoadState('networkidle', {
        timeout: Math.min(this.config.requestTimeoutMs, 10_000),
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        this.logger.debug('Continuing after networkidle timeout', { feature })
        return page
      }
      throw error
    }

    return page
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close()
      this.context = undefined
      this.page = undefined
    }
    if (this.browser) {
      await this.browser.close()
      this.browser = undefined
    }
  }
}

export class LocalBootstrapBridge {
  constructor(
    private readonly config: any,
    private readonly logger: any,
  ) {}

  async bootstrap(input: BrowserBootstrapInput, feature: FeatureName = 'bootstrap'): Promise<BrowserBootstrapResult> {
    const session = new LocalBrowserSession(this.config, this.logger, input)
    const validator = new BootstrapValidator(this.config)

    try {
      const { page, context } = await session.start()
      const headers = await captureRuntimeHeaders(
        page,
        context,
        async () => {
          await session.navigateForFeature(feature)
        },
        this.config.requestTimeoutMs,
        this.logger,
      )

      const now = Date.now()
      return await validator.validate(
        {
          sessionId: 'local-bootstrap-worker',
          cookiesHeader: headers.cookiesHeader,
          authorizationBearer: headers.authorizationBearer,
          xUbsData: headers.xUbsData,
          capturedAt: now,
          lastValidatedAt: now,
          lastRefererByFeature: validator.buildBootstrapReferers(headers.referer),
        },
        {
          observedUserUrl: headers.observedUserUrl,
          observedGetTokenUrl: headers.observedGetTokenUrl,
        },
      )
    } finally {
      await session.close()
    }
  }
}
