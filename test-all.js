import { spawn } from 'node:child_process'
import { join } from 'node:path'
import assert from 'node:assert'

const PORT = '8788'
const serverPath = join(process.cwd(), 'dist/server.js')

// Helper to wait
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function runHttpTests() {
  console.log('--- Starting HTTP Server Tests ---')
  const server = spawn('node', [
    '--no-warnings',
    '--experimental-sqlite',
    '--env-file=.env',
    serverPath
  ], {
    env: { ...process.env, PORT }
  })

  server.stderr.on('data', (data) => {
    console.error(`[Server Stderr] ${data.toString().trim()}`)
  })

  // Wait for server to boot
  await delay(1500)

  try {
    // 1. Health check
    console.log('Testing /health...')
    const healthRes = await fetch(`http://127.0.0.1:${PORT}/health`)
    assert.strictEqual(healthRes.status, 200)
    const healthJson = await healthRes.json()
    assert.strictEqual(healthJson.ok, true)
    console.log('✓ /health OK')

    // 2. Help route
    console.log('Testing /help...')
    const helpRes = await fetch(`http://127.0.0.1:${PORT}/help`)
    assert.strictEqual(helpRes.status, 200)
    const helpText = await helpRes.text()
    assert.ok(helpText.includes('Bantuan ubersuggest-mcp'))
    console.log('✓ /help OK')

    // 3. Guide route
    console.log('Testing /guide...')
    const guideRes = await fetch(`http://127.0.0.1:${PORT}/guide`)
    assert.strictEqual(guideRes.status, 200)
    const guideText = await guideRes.text()
    assert.ok(guideText.includes('<html'))
    console.log('✓ /guide OK')

    // 4. Unauthorized /invoke-tool
    console.log('Testing /invoke-tool (Unauthorized)...')
    const unauthRes = await fetch(`http://127.0.0.1:${PORT}/invoke-tool`)
    assert.strictEqual(unauthRes.status, 401)
    console.log('✓ /invoke-tool (Unauthorized) OK')

    // 5. Authorized /invoke-tool GET (list tools)
    console.log('Testing /invoke-tool (Authorized GET list tools)...')
    const listRes = await fetch(`http://127.0.0.1:${PORT}/invoke-tool`, {
      headers: { 'Authorization': 'Bearer demo-token' }
    })
    assert.strictEqual(listRes.status, 200)
    const listJson = await listRes.json()
    assert.ok(Array.isArray(listJson.tools))
    assert.ok(listJson.tools.find(t => t.name === 'ubersuggest_subscription'))
    console.log('✓ /invoke-tool GET list tools OK')

    // 6. Authorized /invoke-tool POST (execute tool requiring auth -> should trigger 409 ReconnectRequiredError)
    console.log('Testing tool execution with missing auth (should return 409 ReconnectRequiredError)...')
    const execRes = await fetch(`http://127.0.0.1:${PORT}/invoke-tool`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer demo-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tool: 'ubersuggest_subscription',
        input: {}
      })
    })
    assert.strictEqual(execRes.status, 409)
    const execJson = await execRes.json()
    assert.strictEqual(execJson.ok, false)
    assert.strictEqual(execJson.code, 'ReconnectRequiredError')
    console.log('✓ Tool execution 409 redirect OK')

    console.log('All HTTP Tests Passed!')
  } finally {
    server.kill()
    await delay(500)
  }
}

async function runStdioTests() {
  console.log('--- Starting Stdio MCP Tests ---')
  const server = spawn('node', [
    '--no-warnings',
    '--experimental-sqlite',
    '--env-file=.env',
    serverPath,
    '--stdio'
  ])

  let output = ''
  const messages = []

  return new Promise((resolve, reject) => {
    server.stdout.on('data', (data) => {
      output += data.toString()
      let newlineIndex
      while ((newlineIndex = output.indexOf('\n')) !== -1) {
        const line = output.slice(0, newlineIndex).trim()
        output = output.slice(newlineIndex + 1)
        if (line) {
          try {
            messages.push(JSON.parse(line))
          } catch (err) {
            console.error('Non-JSON line in stdout:', line)
          }
        }
      }

      if (messages.length === 1 && messages[0].result) {
        console.log('✓ Stdio Handshake response received')
        assert.ok(messages[0].result.protocolVersion)

        // Request tools list
        const request = JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list'
        }) + '\n'
        server.stdin.write(request)
      } else if (messages.length === 2 && messages[1].result) {
        console.log('✓ Stdio Tools list response received')
        const tools = messages[1].result.tools
        assert.ok(Array.isArray(tools))
        const toolNames = tools.map(t => t.name)
        assert.ok(toolNames.includes('ubersuggest_subscription'))
        assert.ok(toolNames.includes('ubersuggest_auth_reconnect'))

        console.log('All Stdio MCP Tests Passed!')
        server.kill()
        resolve()
      }
    })

    server.stderr.on('data', (data) => {
      // Just print stdio log events
      console.log(`[Stdio Debug Log] ${data.toString().trim()}`)
    })

    // Send initialize request
    const initRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' }
      }
    }) + '\n'
    server.stdin.write(initRequest)

    setTimeout(() => {
      server.kill()
      reject(new Error('Stdio test timed out'))
    }, 5000)
  })
}

async function main() {
  try {
    await runHttpTests()
    await runStdioTests()
    console.log('\n====================================')
    console.log('ALL FEATURE VERIFICATION TESTS PASSED!')
    console.log('====================================')
    process.exit(0)
  } catch (err) {
    console.error('Test verification failed:', err)
    process.exit(1)
  }
}

main()
