import { createServer } from 'node:http'
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LocalD1Database } from './adapters/localD1.js'
import { InMemoryLockStore } from './adapters/inMemoryLock.js'
import { LocalBootstrapBridge } from './adapters/localBootstrap.js'
import { createContainer } from './app/container.js'
import { listToolDefinitions } from './app/toolRegistry.js'
import { routeRequest } from './app/routes.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { CloudflareBindings } from './config/loadConfig.js'
import type { AppContainer } from './app/container.js'
import { ReconnectRequiredError } from './utils/errors.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const appRoot = join(__dirname, '..')

// 1. Ensure .env file exists with default dummy keys if not present
const envPath = join(appRoot, '.env')
if (!existsSync(envPath)) {
  console.error('Generating default .env file...')
  const randomSecret = () => Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
  const defaultEnv = `UBERSUGGEST_BASE_URL=https://app.neilpatel.com
UBERSUGGEST_PUBLIC_BASE_URL=http://127.0.0.1:8787
UBERSUGGEST_OAUTH_SIGNING_SECRET=${randomSecret()}
UBERSUGGEST_OAUTH_USERS_JSON={"admin":"admin-secure-password-123"}
UBERSUGGEST_AUTH_TOKENS_JSON={"demo":"demo-token"}
UBERSUGGEST_AUTH_ENCRYPTION_KEY=${randomSecret()}
UBERSUGGEST_AWS_BOOTSTRAP_URL=http://local-bootstrap-worker
UBERSUGGEST_AWS_BOOTSTRAP_SHARED_SECRET=local-shared-secret
UBERSUGGEST_LOG_LEVEL=info
UBERSUGGEST_DB_FILE=ubersuggest.db
PORT=8787
`
  writeFileSync(envPath, defaultEnv, 'utf8')
}

// 2. Initialize Database and run migrations
const dbFile = process.env.UBERSUGGEST_DB_FILE || 'ubersuggest.db'
const dbPath = isAbsolute(dbFile) ? dbFile : join(appRoot, dbFile)
console.error(`Initializing SQLite database at: ${dbPath}`)
const localDb = new LocalD1Database(dbPath)

async function runMigrations() {
  const migrationsDir = join(appRoot, 'migrations')
  if (!existsSync(migrationsDir)) {
    console.error(`Migrations directory not found at: ${migrationsDir}`)
    return
  }

  // Create schema history table
  const method = 'exec'
  localDb[method](`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      run_at INTEGER NOT NULL
    )
  `)

  const files = readdirSync(migrationsDir).sort()
  for (const file of files) {
    if (!file.endsWith('.sql')) continue

    const row = await localDb.prepare('SELECT id FROM schema_migrations WHERE name = ?').bind(file).first() as any
    if (row) continue

    console.error(`Applying migration: ${file}`)
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    localDb[method](sql)

    await localDb.prepare('INSERT INTO schema_migrations (name, run_at) VALUES (?, ?)')
      .bind(file, Date.now())
      .run()
  }
}

// 3. Setup mock Cloudflare bindings
const inMemoryLocks = new InMemoryLockStore()
const mockSessionCoordinator = {
  getByName(sessionId: string) {
    return {
      async fetch(urlStr: string, init: any) {
        const url = new URL(urlStr)
        const body = JSON.parse(init.body)

        if (url.pathname === '/acquire') {
          const ok = await inMemoryLocks.acquire(sessionId, body.owner, body.expiresAt)
          return new Response(JSON.stringify({ ok }))
        }

        if (url.pathname === '/release') {
          await inMemoryLocks.release(sessionId, body.owner)
          return new Response(JSON.stringify({ ok: true }))
        }

        return new Response(JSON.stringify({ ok: false }), { status: 404 })
      },
    }
  },
}

const mockEnv: CloudflareBindings = {
  UBERSUGGEST_DB: localDb as any,
  SESSION_COORDINATOR: mockSessionCoordinator as any,
  UBERSUGGEST_BASE_URL: process.env.UBERSUGGEST_BASE_URL,
  UBERSUGGEST_OAUTH_SIGNING_SECRET: process.env.UBERSUGGEST_OAUTH_SIGNING_SECRET,
  UBERSUGGEST_OAUTH_USERS_JSON: process.env.UBERSUGGEST_OAUTH_USERS_JSON,
  UBERSUGGEST_OAUTH_ACCESS_TOKEN_TTL_SECONDS: process.env.UBERSUGGEST_OAUTH_ACCESS_TOKEN_TTL_SECONDS,
  UBERSUGGEST_OAUTH_AUTHORIZATION_CODE_TTL_SECONDS: process.env.UBERSUGGEST_OAUTH_AUTHORIZATION_CODE_TTL_SECONDS,
  UBERSUGGEST_OAUTH_INVITE_TTL_SECONDS: process.env.UBERSUGGEST_OAUTH_INVITE_TTL_SECONDS,
  UBERSUGGEST_OAUTH_PASSWORD_MIN_LENGTH: process.env.UBERSUGGEST_OAUTH_PASSWORD_MIN_LENGTH,
  UBERSUGGEST_PUBLIC_BASE_URL: process.env.UBERSUGGEST_PUBLIC_BASE_URL,
  UBERSUGGEST_BOOTSTRAP_PATH: process.env.UBERSUGGEST_BOOTSTRAP_PATH,
  UBERSUGGEST_REQUEST_TIMEOUT_MS: process.env.UBERSUGGEST_REQUEST_TIMEOUT_MS,
  UBERSUGGEST_POLL_INTERVAL_MS: process.env.UBERSUGGEST_POLL_INTERVAL_MS,
  UBERSUGGEST_POLL_TIMEOUT_MS: process.env.UBERSUGGEST_POLL_TIMEOUT_MS,
  UBERSUGGEST_LOG_LEVEL: process.env.UBERSUGGEST_LOG_LEVEL as any,
  UBERSUGGEST_TOP_COUNTRIES_LANG_LOCS: process.env.UBERSUGGEST_TOP_COUNTRIES_LANG_LOCS,
  UBERSUGGEST_AUTH_TOKENS_JSON: process.env.UBERSUGGEST_AUTH_TOKENS_JSON,
  UBERSUGGEST_AWS_BOOTSTRAP_URL: 'http://local-bootstrap-worker',
  UBERSUGGEST_AWS_BOOTSTRAP_SHARED_SECRET: process.env.UBERSUGGEST_AWS_BOOTSTRAP_SHARED_SECRET,
  UBERSUGGEST_AUTH_ENCRYPTION_KEY: process.env.UBERSUGGEST_AUTH_ENCRYPTION_KEY,
  UBERSUGGEST_LOCK_TIMEOUT_MS: process.env.UBERSUGGEST_LOCK_TIMEOUT_MS,
  UBERSUGGEST_SESSION_REVALIDATE_AGE_MS: process.env.UBERSUGGEST_SESSION_REVALIDATE_AGE_MS,
  UBERSUGGEST_ENABLE_JSON_RESPONSE: process.env.UBERSUGGEST_ENABLE_JSON_RESPONSE,
  UBERSUGGEST_DIAGNOSTIC_LOGGING: process.env.UBERSUGGEST_DIAGNOSTIC_LOGGING,
  UBERSUGGEST_DIAGNOSTIC_LOG_SAMPLE_RATE: process.env.UBERSUGGEST_DIAGNOSTIC_LOG_SAMPLE_RATE,
  UBERSUGGEST_DIAGNOSTIC_LOG_ROUTES: process.env.UBERSUGGEST_DIAGNOSTIC_LOG_ROUTES,
}

// 4. Initialize Container for configs/logging
const container = createContainer(mockEnv)

// 5. Intercept global fetch for Local Playwright Reconnect Bootstrap
const originalFetch = globalThis.fetch
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url

  if (urlStr === 'http://local-bootstrap-worker') {
    container.logger.info('Intercepted AWS bootstrap fetch, running Playwright locally')
    try {
      const body = JSON.parse(init?.body as string)
      const localBridge = new LocalBootstrapBridge(container.config, container.logger)
      const result = await localBridge.bootstrap(body.input, body.feature)
      return new Response(JSON.stringify({ ok: true, result }))
    } catch (error) {
      container.logger.error('Local bootstrap failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      return new Response(
        JSON.stringify({
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        }),
        { status: 500 },
      )
    }
  }

  return originalFetch(input, init)
}

// 6. Stdio MCP Runner
async function runStdioMcp() {
  const principal = {
    subject: 'local-user',
    username: 'admin',
    scopes: ['read', 'write'],
  }

  const context = container.createToolContext(principal)
  const server = new McpServer(
    {
      name: 'ubersuggest-mcp-node-stdio',
      version: '0.1.0',
    },
    {
      capabilities: {
        logging: {},
      },
    },
  )

  for (const tool of listToolDefinitions()) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema as any,
        outputSchema: tool.outputSchema as any,
      },
      async (input: any) => {
        try {
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
        } catch (error) {
          container.logger.error(`Tool execution failed: ${tool.name}`, {
            error: error instanceof Error ? error.message : String(error),
          })
          throw error
        }
      },
    )
  }

  const transport = new StdioServerTransport()
  await server.connect(transport)
  container.logger.info('MCP Stdio server connected and listening')
}

// 6b. Auto-reconnect from cookies.json on startup
async function autoReconnectIfNeeded(container: AppContainer) {
  const principal = {
    subject: 'local-user',
    username: 'admin',
    scopes: ['read', 'write'],
  }
  const sessionId = `user:${principal.subject}`
  const context = container.createToolContext(principal)

  // Check if existing session is still valid
  try {
    await context.services.subscription.getSubscription()
    container.logger.info('Existing session is valid, skipping auto-reconnect')
    return
  } catch (error) {
    if (!(error instanceof ReconnectRequiredError)) {
      container.logger.warn('Session validation gave unexpected error, proceeding anyway', {
        error: error instanceof Error ? error.message : String(error),
      })
      return
    }
  }

  // No valid session - try to auto-reconnect from cookies.json
  const cookiesPath = join(appRoot, 'cookies.json')
  if (!existsSync(cookiesPath)) {
    container.logger.warn('No valid session and no cookies.json found. Run reconnect first or place cookies in cookies.json')
    return
  }

  container.logger.info('Auto-reconnecting from cookies.json...')
  try {
    const raw = readFileSync(cookiesPath, 'utf-8')
    const cookies = JSON.parse(raw)
    const job = await context.reconnectCoordinator.startManualReconnect(
      principal.subject,
      sessionId,
      {
        authMode: 'cookies',
        cookies: {
          raw: JSON.stringify(cookies),
          format: 'json',
        },
      },
    )
    container.logger.info('Auto-reconnect completed', { status: job.status, jobId: job.jobId })
  } catch (error) {
    container.logger.error('Auto-reconnect from cookies.json failed, tools will require manual reconnect', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

// 7. Async Main Entry Point
async function main() {
  await runMigrations()

  const isStdio = process.argv.includes('--stdio')

  if (isStdio) {
    await autoReconnectIfNeeded(container)
    // Run standard stdio MCP
    await runStdioMcp()
  } else {
    // Start HTTP server for browser helper, /invoke-tool, and SSE
    const port = Number(process.env.PORT || '8787')
    const host = '127.0.0.1'

    const server = createServer(async (req, res) => {
      try {
        const protocol = req.headers['x-forwarded-proto'] || 'http'
        const reqHost = req.headers.host || `${host}:${port}`
        const url = new URL(req.url || '', `${protocol}://${reqHost}`)

        // Read body buffer
        const chunks: Buffer[] = []
        for await (const chunk of req) {
          chunks.push(chunk)
        }
        const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined

        const webHeaders = new Headers()
        for (const [key, value] of Object.entries(req.headers)) {
          if (Array.isArray(value)) {
            for (const val of value) {
              webHeaders.append(key, val)
            }
          } else if (value !== undefined) {
            webHeaders.append(key, value)
          }
        }

        const webRequest = new Request(url.toString(), {
          method: req.method,
          headers: webHeaders,
          body,
          ...(body ? { duplex: 'half' } : {}),
        })

        const webResponse = await routeRequest(webRequest, mockEnv)

        res.statusCode = webResponse.status
        res.statusMessage = webResponse.statusText

        webResponse.headers.forEach((value, key) => {
          res.setHeader(key, value)
        })

        const responseBody = webResponse.body
        if (responseBody) {
          const reader = responseBody.getReader()
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            res.write(value)
          }
        }
        res.end()
      } catch (err) {
        container.logger.error('HTTP server request handler failed', {
          error: err instanceof Error ? err.message : String(err),
        })
        res.statusCode = 500
        res.end('Internal Server Error')
      }
    })

    server.listen(port, host, () => {
      console.log(`Ubersuggest MCP Local server running at http://${host}:${port}`)
      console.log('Available endpoints: /health, /help, /guide, /login, /mcp, /invoke-tool')
    })
  }
}

main().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
