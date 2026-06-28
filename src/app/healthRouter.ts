import type { AppContainer } from './container.js'

export function getHealth(container: AppContainer): {
  ok: boolean
  service: string
  authEnabled: boolean
  awsBootstrapConfigured: boolean
} {
  return {
    ok: true,
    service: 'ubersuggest-mcp-cf',
    authEnabled: Object.keys(container.config.authTokens).length > 0,
    awsBootstrapConfigured: Boolean(container.config.awsBootstrapUrl),
  }
}
