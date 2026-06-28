import type { UbersuggestAwsConfig } from '../config/loadConfig.js'
import { resolveOAuthUrls } from '../auth/oauthMetadata.js'
import { listToolDefinitions } from './toolRegistry.js'

const cookieFormats = ['auto', 'header', 'json', 'netscape'] as const

type ToolSummary = {
  name: string
  description: string
}

type ToolGroup = {
  title: string
  description: string
  tools: ToolSummary[]
}

type PublicRoute = {
  method: string
  path: string
  purpose: string
}

type DocsModel = {
  issuer: string
  links: {
    mcp: string
    help: string
    guide: string
    auth: string
    reconnect: string
    connect: string
    invite: string
    invokeTool: string
    authorize: string
    token: string
    register: string
    oauthProtectedResource: string
    oauthAuthorizationServer: string
    openIdConfiguration: string
    neilPatelApp: string
  }
  publicRoutes: PublicRoute[]
  cookieFormats: readonly string[]
  toolGroups: ToolGroup[]
}

const toolGroupDefinitions: Array<{ title: string; description: string; names: string[] }> = [
  {
    title: 'Akun dan onboarding',
    description: 'Untuk cek akun MCP dan membuat akses user baru.',
    names: ['ubersuggest_subscription', 'ubersuggest_projects', 'ubersuggest_admin_create_invite'],
  },
  {
    title: 'Domain dan traffic',
    description: 'Untuk melihat ringkasan domain, halaman teratas, dan estimasi traffic.',
    names: ['ubersuggest_domain_overview', 'ubersuggest_domain_top_pages', 'ubersuggest_traffic_estimation'],
  },
  {
    title: 'Backlink',
    description: 'Untuk melihat kondisi backlink dan peluang backlink baru.',
    names: ['ubersuggest_backlink_overview', 'ubersuggest_backlink_opportunities'],
  },
  {
    title: 'Keyword dan audit',
    description: 'Untuk riset keyword, peluang SEO, dan audit teknis/project.',
    names: ['ubersuggest_keyword_research', 'ubersuggest_seo_opportunities', 'ubersuggest_site_audit'],
  },
  {
    title: 'Auth dan sesi',
    description: 'Untuk menyambungkan ulang sesi Ubersuggest atau mereset sesi yang tersimpan.',
    names: ['ubersuggest_auth_reconnect', 'ubersuggest_auth_logout'],
  },
]

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildDocsModel(request: Request, config: UbersuggestAwsConfig): DocsModel {
  const urls = resolveOAuthUrls(request, config)
  const issuer = urls.issuer.replace(/\/$/, '')

  return {
    issuer,
    links: {
      mcp: urls.resource,
      help: `${issuer}/help`,
      guide: `${issuer}/guide`,
      auth: `${issuer}/auth`,
      reconnect: `${issuer}/reconnect`,
      connect: `${issuer}/cookies`,
      invite: `${issuer}/invite`,
      invokeTool: `${issuer}/invoke-tool`,
      authorize: urls.authorizeUrl,
      token: urls.tokenUrl,
      register: urls.registrationUrl,
      oauthProtectedResource: urls.protectedResourceMetadataUrl,
      oauthAuthorizationServer: urls.authorizationServerMetadataUrl,
      openIdConfiguration: urls.openIdConfigurationUrl,
      neilPatelApp: config.baseUrl,
    },
    publicRoutes: [
      { method: 'GET', path: '/health', purpose: 'Cek apakah service hidup.' },
      { method: 'GET', path: '/help', purpose: 'Bantuan teknis cepat dalam format Markdown.' },
      { method: 'GET', path: '/guide', purpose: 'Panduan langkah demi langkah yang lebih ramah dibaca manusia.' },
      { method: 'GET', path: '/.well-known/oauth-protected-resource', purpose: 'Metadata resource MCP untuk klien OAuth.' },
      { method: 'GET', path: '/.well-known/oauth-authorization-server', purpose: 'Metadata authorization server OAuth.' },
      { method: 'GET', path: '/.well-known/openid-configuration', purpose: 'Alias metadata OAuth/OpenID.' },
      { method: 'GET|POST', path: '/login, /a, /authorize', purpose: 'Halaman login MCP di browser; juga melayani flow OAuth untuk klien yang mendukungnya.' },
      { method: 'POST', path: '/t, /token', purpose: 'Tukar authorization code menjadi bearer token.' },
      { method: 'POST', path: '/r, /register', purpose: 'Dynamic client registration untuk klien OAuth.' },
      { method: 'GET|POST', path: '/invite', purpose: 'Redeem invite dan set password user runtime.' },
      { method: 'GET|POST', path: '/cookies, /connect', purpose: 'Helper browser untuk paste atau upload cookies Ubersuggest.' },
      { method: 'GET|POST', path: '/auth', purpose: 'Helper jika URL login OAuth terlalu panjang di terminal.' },
      { method: 'GET|POST', path: '/reconnect', purpose: 'Mulai reconnect sesi Ubersuggest, atau ambil connect link.' },
      { method: 'GET', path: '/reconnect/{jobId}', purpose: 'Cek status reconnect sampai siap dipakai.' },
      { method: 'POST', path: '/logout', purpose: 'Reset sesi Ubersuggest yang tersimpan untuk user saat ini.' },
      { method: 'GET|POST', path: '/invoke-tool', purpose: 'List tool atau panggil satu tool lewat HTTP biasa.' },
      { method: 'ANY', path: '/mcp', purpose: 'Endpoint MCP utama untuk Claude Code, Codex, Gemini, dan klien lain.' },
    ],
    cookieFormats,
    toolGroups: buildToolGroups(),
  }
}

function buildToolGroups(): ToolGroup[] {
  const toolsByName = new Map(listToolDefinitions().map((tool) => [tool.name, { name: tool.name, description: tool.description }]))

  return toolGroupDefinitions.map((group) => ({
    title: group.title,
    description: group.description,
    tools: group.names.map((name) => toolsByName.get(name)).filter((tool): tool is ToolSummary => Boolean(tool)),
  }))
}

function buildClaudeCodeSnippet(model: DocsModel): string {
  return `{
  "mcpServers": {
    "ubersuggest-mcp": {
      "type": "http",
      "url": "${model.links.mcp}"
    }
  }
}`
}

function buildCodexSnippet(model: DocsModel): string {
  return `[mcp_servers.ubersuggest_cf_live]
url = "${model.links.mcp}"`
}

function buildGeminiSnippet(model: DocsModel): string {
  return `{
  "mcpServers": {
    "ubersuggest-mcp": {
      "httpUrl": "${model.links.mcp}",
      "timeout": 30000
    }
  }
}`
}

function buildReconnectCurl(model: DocsModel): string {
  return `curl -X POST "${model.links.reconnect}" \\
  -H "authorization: Bearer <access-token-mcp>" \\
  -H "content-type: application/json" \\
  -d '{
    "authMode": "cookies",
    "cookies": "id=...; trnstl=...; cookie_lain=...",
    "format": "header"
  }'`
}

function buildReconnectGetCurl(model: DocsModel): string {
  return `curl "${model.links.reconnect}" \\
  -H "authorization: Bearer <access-token-mcp>"`
}

function buildReconnectStatusCurl(model: DocsModel): string {
  return `curl "${model.links.reconnect}/<jobId>" \\
  -H "authorization: Bearer <access-token-mcp>"`
}

function buildInvokeToolCurl(model: DocsModel): string {
  return `curl -X POST "${model.links.invokeTool}" \\
  -H "authorization: Bearer <access-token-mcp>" \\
  -H "content-type: application/json" \\
  -d '{
    "tool": "ubersuggest_projects",
    "input": {}
  }'`
}

function renderToolGroupsMarkdown(toolGroups: ToolGroup[]): string {
  return toolGroups.map((group) => [
    `### ${group.title}`,
    group.description,
    '',
    ...group.tools.map((tool) => `- \`${tool.name}\` — ${tool.description}`),
  ].join('\n')).join('\n\n')
}

export function getHelpMarkdown(request: Request, config: UbersuggestAwsConfig): string {
  const model = buildDocsModel(request, config)

  return [
    '# Bantuan ubersuggest-mcp',
    '',
    'Server ini adalah endpoint MCP remote untuk akses data Ubersuggest. Klien MCP terhubung ke `/mcp`, lalu user login ke MCP dan menyambungkan sesi Ubersuggest miliknya sendiri lewat reconnect.',
    '',
    '## Alur paling singkat',
    '',
    '1. Hubungkan klien MCP ke endpoint berikut.',
    `   - \`${model.links.mcp}\``,
    '2. Selesaikan login OAuth MCP di browser.',
    `3. Jika URL login terlalu panjang saat dicopy dari terminal, buka \`${model.links.auth}\` lalu paste URL panjang itu di sana.`,
    '4. Setelah login MCP berhasil, sambungkan sesi Ubersuggest dengan cookies dari browser yang sedang login di app.neilpatel.com.',
    '5. Tes tool pertama, misalnya ambil daftar project Ubersuggest Anda.',
    '',
    '## Endpoint penting',
    '',
    `- MCP utama: \`${model.links.mcp}\``,
    `- Help: \`${model.links.help}\``,
    `- Guide: \`${model.links.guide}\``,
    `- OAuth helper: \`${model.links.auth}\``,
    `- Reconnect: \`${model.links.reconnect}\``,
    `- Browser connect: \`${model.links.connect}\``,
    `- Direct tool call: \`${model.links.invokeTool}\``,
    '',
    '## Setup klien MCP',
    '',
    '### Claude Code / Claude Desktop',
    '```json',
    buildClaudeCodeSnippet(model),
    '```',
    '',
    '### Codex CLI',
    '```toml',
    buildCodexSnippet(model),
    '```',
    '',
    '### Gemini CLI',
    '```json',
    buildGeminiSnippet(model),
    '```',
    '',
    'Atau dengan command:',
    '```bash',
    `gemini mcp add --transport http ubersuggest-mcp ${model.links.mcp}`,
    '```',
    '',
    '## Cara login ke MCP',
    '',
    '- Route login browser yang stabil ada di `/login`.',
    '- Route token ada di `/t` atau `/token`.',
    '- Route dynamic registration ada di `/r` atau `/register`.',
    '- Flow yang dipakai adalah OAuth authorization code + PKCE.',
    '- Bearer token bisa berasal dari OAuth, atau dari token statis yang dikonfigurasi admin server.',
    '- Login pertama ini hanya untuk masuk ke MCP, belum otomatis mengaktifkan data Ubersuggest.',
    '',
    '## Jika URL auth terlalu panjang',
    '',
    `Buka \`${model.links.auth}\`, lalu paste URL panjang \`${model.links.authorize}\` atau \`${model.links.authorize.replace('/a', '/authorize')}\` yang diberikan klien MCP. Helper ini akan mengubahnya menjadi URL login yang lebih pendek dan mudah dibuka di browser.`,
    '',
    '## Cara reconnect sesi Ubersuggest',
    '',
    'Setelah login MCP berhasil, Anda masih perlu menyambungkan sesi Ubersuggest yang sedang aktif. Reconnect bisa dilakukan dengan dua cara:',
    '',
    '1. **Via browser helper**',
    `   - GET \`${model.links.reconnect}\` dengan bearer token untuk membuat connect link.`,
    `   - Buka URL \`${model.links.connect}?code=...\`.`,
    '   - Paste cookies atau upload file cookies, lalu submit.',
    '2. **Via API atau tool**',
    '   - Panggil tool `ubersuggest_auth_reconnect`, atau kirim POST ke `/reconnect`.',
    '',
    `Format cookies yang diterima: ${model.cookieFormats.map((format) => `\`${format}\``).join(', ')}.`,
    '',
    '### Contoh ambil connect link',
    '```bash',
    buildReconnectGetCurl(model),
    '```',
    '',
    '### Contoh reconnect manual',
    '```bash',
    buildReconnectCurl(model),
    '```',
    '',
    '## Cara ambil cookies Ubersuggest',
    '',
    `1. Buka ${model.links.neilPatelApp} dan login seperti biasa.`,
    '2. Buka DevTools browser.',
    '3. Masuk ke tab Network lalu refresh halaman.',
    '4. Buka salah satu request ke `app.neilpatel.com`.',
    '5. Copy isi header `cookie`.',
    '6. Paste ke helper `/cookies` atau ke body JSON `/reconnect`.',
    '',
    'Tips: ambil cookies yang fresh setelah memastikan Anda masih benar-benar login.',
    '',
    '## Cara cek status reconnect',
    '',
    'Setelah reconnect dimulai, simpan `jobId` lalu polling endpoint berikut sampai status siap dipakai.',
    '',
    '```bash',
    buildReconnectStatusCurl(model),
    '```',
    '',
    '## Invite onboarding',
    '',
    '- Admin bootstrap bisa membuat invite dengan tool `ubersuggest_admin_create_invite`.',
    `- User yang diundang membuka \`${model.links.invite}?code=...\` lalu membuat password sendiri.`,
    '- Setelah itu user login normal via halaman OAuth MCP yang sama seperti user lain.',
    '',
    '## Direct tool invocation via HTTP',
    '',
    '- `GET /invoke-tool` akan menampilkan daftar tool aktif.',
    '- `POST /invoke-tool` akan menjalankan satu tool.',
    '',
    '```bash',
    buildInvokeToolCurl(model),
    '```',
    '',
    '## Route publik',
    '',
    ...model.publicRoutes.map((route) => `- \`${route.method}\` \`${route.path}\` — ${route.purpose}`),
    '',
    '## Daftar tool aktif',
    '',
    renderToolGroupsMarkdown(model.toolGroups),
    '',
    '## Tes cepat setelah login',
    '',
    'Coba prompt seperti ini di klien MCP Anda:',
    '',
    '- `ambil daftar project Ubersuggest saya`',
    '- `tes mcp ubersuggest ambil project`',
    '- `ambil domain overview anugerahkubah.co.id`',
    '',
    '## Catatan penting',
    '',
    '- Route yang butuh akses user memakai header `Authorization: Bearer <token>`.',
    '- Login MCP dan reconnect Ubersuggest adalah dua langkah yang berbeda.',
    '- Jika sesi Ubersuggest sudah kedaluwarsa atau berubah, jalankan reconnect lagi.',
    '- Jika ingin mengosongkan sesi yang tersimpan, gunakan `ubersuggest_auth_logout` atau `POST /logout`.',
  ].join('\n')
}

function codeBlock(code: string, language = ''): string {
  return `<pre><code class="language-${escapeHtml(language)}">${escapeHtml(code)}</code></pre>`
}

function unorderedList(items: string[]): string {
  return `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`
}

function renderToolGroupsHtml(toolGroups: ToolGroup[]): string {
  return toolGroups.map((group) => `
    <section class="card">
      <h3>${escapeHtml(group.title)}</h3>
      <p>${escapeHtml(group.description)}</p>
      <ul>
        ${group.tools.map((tool) => `<li><code>${escapeHtml(tool.name)}</code> — ${escapeHtml(tool.description)}</li>`).join('')}
      </ul>
    </section>
  `).join('')
}

export function renderGuideHtml(request: Request, config: UbersuggestAwsConfig): string {
  const model = buildDocsModel(request, config)

  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Panduan ubersuggest-mcp</title>
    <style>
      :root {
        color-scheme: dark;
      }
      body {
        margin: 0;
        font-family: system-ui, sans-serif;
        background: #0f172a;
        color: #e2e8f0;
        line-height: 1.6;
      }
      main {
        max-width: 980px;
        margin: 0 auto;
        padding: 32px 20px 56px;
      }
      .hero, .card {
        background: #111827;
        border: 1px solid #334155;
        border-radius: 18px;
        padding: 24px;
        margin-bottom: 20px;
      }
      .hero h1, .card h2, .card h3 {
        margin-top: 0;
      }
      .links {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        margin-top: 16px;
      }
      .link-box {
        border: 1px solid #334155;
        border-radius: 12px;
        padding: 14px;
        background: #0b1220;
      }
      .link-box strong {
        display: block;
        margin-bottom: 6px;
      }
      p, li {
        color: #cbd5e1;
      }
      code {
        color: #93c5fd;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      pre {
        background: #020617;
        color: #e2e8f0;
        padding: 16px;
        border-radius: 12px;
        overflow: auto;
        border: 1px solid #1e293b;
      }
      .callout {
        background: #082f49;
        border: 1px solid #0ea5e9;
        color: #e0f2fe;
        padding: 14px 16px;
        border-radius: 12px;
        margin: 16px 0;
      }
      .warning {
        background: #3f1d0d;
        border-color: #fb923c;
        color: #ffedd5;
      }
      a {
        color: #93c5fd;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>Panduan pakai ubersuggest-mcp</h1>
        <p>Halaman ini dibuat untuk membantu Anda memakai MCP Ubersuggest dari nol. Intinya ada dua langkah besar: <strong>login ke MCP</strong>, lalu <strong>sambungkan sesi Ubersuggest Anda</strong>.</p>
        <div class="callout">Login MCP dan login Ubersuggest itu dua hal yang berbeda. Walaupun OAuth MCP sudah berhasil, data Ubersuggest belum akan jalan sampai reconnect selesai.</div>
        <div class="links">
          <div class="link-box"><strong>MCP utama</strong><code>${escapeHtml(model.links.mcp)}</code></div>
          <div class="link-box"><strong>Help teknis</strong><code>${escapeHtml(model.links.help)}</code></div>
          <div class="link-box"><strong>OAuth helper</strong><code>${escapeHtml(model.links.auth)}</code></div>
          <div class="link-box"><strong>Reconnect</strong><code>${escapeHtml(model.links.reconnect)}</code></div>
        </div>
      </section>

      <section class="card">
        <h2>Mulai cepat</h2>
        ${unorderedList([
          `Hubungkan klien MCP Anda ke <code>${escapeHtml(model.links.mcp)}</code>.`,
          'Selesaikan login OAuth MCP di browser.',
          `Jika URL login terlalu panjang saat dicopy dari terminal, buka <code>${escapeHtml(model.links.auth)}</code> lalu paste URL itu di sana.`,
          `Ambil cookies dari browser yang sedang login di <code>${escapeHtml(model.links.neilPatelApp)}</code>.`,
          'Jalankan reconnect, lalu tunggu sampai status reconnect siap.',
          'Tes tool pertama, misalnya ambil daftar project Ubersuggest Anda.',
        ])}
      </section>

      <section class="card">
        <h2>1. Cara enable MCP</h2>
        <p>Pilih contoh config yang paling dekat dengan klien yang Anda pakai.</p>
        <h3>Claude Code / Claude Desktop</h3>
        ${codeBlock(buildClaudeCodeSnippet(model), 'json')}
        <h3>Codex CLI</h3>
        ${codeBlock(buildCodexSnippet(model), 'toml')}
        <h3>Gemini CLI</h3>
        ${codeBlock(buildGeminiSnippet(model), 'json')}
        <p>Atau tambahkan langsung dengan command berikut:</p>
        ${codeBlock(`gemini mcp add --transport http ubersuggest-mcp ${model.links.mcp}`, 'bash')}
      </section>

      <section class="card">
        <h2>2. Cara auth pertama ke MCP</h2>
        <p>Saat klien MCP meminta login, browser akan diarahkan ke flow OAuth server ini. Route pentingnya adalah <code>/a</code> atau <code>/authorize</code> untuk login, <code>/t</code> atau <code>/token</code> untuk tukar code menjadi token, dan <code>/r</code> atau <code>/register</code> untuk registrasi klien OAuth.</p>
        <p>Flow ini memakai <strong>authorization code + PKCE</strong>. Setelah selesai, Anda akan punya bearer token untuk mengakses MCP.</p>
      </section>

      <section class="card">
        <h2>3. Jika URL auth terlalu panjang di terminal</h2>
        <p>Beberapa terminal membungkus URL login OAuth sehingga susah dibuka. Kalau itu terjadi, buka helper berikut di browser:</p>
        ${codeBlock(model.links.auth)}
        <p>Lalu paste URL panjang dari terminal. Server akan membuat URL login yang lebih pendek dan lebih mudah dibuka.</p>
      </section>

      <section class="card">
        <h2>4. Sambungkan sesi Ubersuggest Anda</h2>
        <p>Setelah login MCP berhasil, Anda masih perlu menyambungkan sesi Ubersuggest yang benar-benar aktif. Sumber cookies-nya harus dari browser yang sedang login di <code>${escapeHtml(model.links.neilPatelApp)}</code>.</p>
        <div class="callout warning">Kalau cookies sudah lama, logout, atau berubah, reconnect bisa gagal. Ambil cookies yang fresh setelah memastikan akun Ubersuggest Anda masih login.</div>
        <p>Format cookies yang didukung:</p>
        ${unorderedList(model.cookieFormats.map((format) => `<code>${escapeHtml(format)}</code>`))}
      </section>

      <section class="card">
        <h2>5. Cara ambil cookies Ubersuggest</h2>
        ${unorderedList([
          `Buka <code>${escapeHtml(model.links.neilPatelApp)}</code> dan login seperti biasa.`,
          'Buka DevTools browser.',
          'Masuk ke tab Network lalu refresh halaman.',
          'Buka salah satu request ke app.neilpatel.com.',
          'Copy isi header <code>cookie</code>.',
          'Paste ke helper browser atau ke request JSON reconnect.',
        ])}
      </section>

      <section class="card">
        <h2>6. Alternatif browser reconnect</h2>
        <p>Kalau Anda ingin alur yang lebih mudah, mintalah connect link dulu lalu buka halaman browser reconnect.</p>
        <h3>Ambil connect link</h3>
        ${codeBlock(buildReconnectGetCurl(model), 'bash')}
        <p>Respons GET ini akan berisi connect URL seperti <code>${escapeHtml(model.links.connect)}?code=...</code>. Buka URL itu, lalu paste cookies atau upload file cookies.</p>
      </section>

      <section class="card">
        <h2>7. Cara manual via API atau tool</h2>
        <p>Kalau Anda lebih nyaman memakai API, kirim POST ke endpoint reconnect berikut. Alur yang sama juga tersedia lewat tool <code>ubersuggest_auth_reconnect</code>.</p>
        ${codeBlock(buildReconnectCurl(model), 'bash')}
      </section>

      <section class="card">
        <h2>8. Cara cek status reconnect</h2>
        <p>Setelah reconnect dimulai, simpan <code>jobId</code> dari respons lalu cek statusnya sampai siap dipakai.</p>
        ${codeBlock(buildReconnectStatusCurl(model), 'bash')}
      </section>

      <section class="card">
        <h2>9. Cara tes setelah login</h2>
        <p>Sesudah reconnect sukses, coba prompt sederhana seperti ini di klien MCP Anda:</p>
        ${unorderedList([
          '<code>ambil daftar project Ubersuggest saya</code>',
          '<code>tes mcp ubersuggest ambil project</code>',
          '<code>ambil domain overview anugerahkubah.co.id</code>',
          '<code>jalankan site audit untuk project saya</code>',
        ])}
        <p>Kalau ingin memanggil tool langsung lewat HTTP, Anda bisa pakai endpoint berikut:</p>
        ${codeBlock(buildInvokeToolCurl(model), 'bash')}
      </section>

      <section class="card">
        <h2>10. Invite user baru</h2>
        <p>Bagian ini khusus admin bootstrap. Admin bisa membuat link invite dengan tool <code>ubersuggest_admin_create_invite</code>.</p>
        <p>User yang menerima invite cukup membuka <code>${escapeHtml(model.links.invite)}?code=...</code>, membuat password, lalu login normal lewat flow OAuth MCP yang sama seperti user lain.</p>
      </section>

      <section class="card">
        <h2>Referensi cepat</h2>
        <p>Kalau Anda butuh versi yang lebih teknis, buka <a href="${escapeHtml(model.links.help)}">${escapeHtml(model.links.help)}</a>.</p>
        <p>Endpoint publik yang tersedia saat ini:</p>
        ${unorderedList(model.publicRoutes.map((route) => `<code>${escapeHtml(route.method)}</code> <code>${escapeHtml(route.path)}</code> — ${escapeHtml(route.purpose)}`))}
      </section>

      <section class="card">
        <h2>Daftar tool aktif</h2>
        <p>Tool di bawah ini dirender dari registry aplikasi, jadi harus tetap sinkron dengan server.</p>
      </section>
      ${renderToolGroupsHtml(model.toolGroups)}
    </main>
  </body>
</html>`
}
