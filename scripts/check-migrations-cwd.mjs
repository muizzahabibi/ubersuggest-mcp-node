import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const cwd = mkdtempSync(join(tmpdir(), 'ubersuggest-mcp-cwd-'))
const child = spawnSync(
  process.execPath,
  ['--experimental-sqlite', `--env-file=${join(appRoot, '.env')}`, join(appRoot, 'dist/server.js'), '--stdio'],
  { cwd, timeout: 1500, encoding: 'utf8' },
)

rmSync(cwd, { recursive: true, force: true })

const output = `${child.stdout}\n${child.stderr}`
if (!output.includes(join(appRoot, 'ubersuggest.db'))) {
  throw new Error(`server did not use app-root database path:\n${output}`)
}
if (!output.includes('MCP Stdio server connected and listening')) {
  throw new Error(`stdio server did not start cleanly:\n${output}`)
}
