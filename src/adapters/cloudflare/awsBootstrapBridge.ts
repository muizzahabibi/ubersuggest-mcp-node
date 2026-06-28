import type { BrowserBootstrapInput, BrowserBootstrapResult, FeatureName } from '../../domain/types/session.js'
import type { UbersuggestAwsConfig } from '../../config/loadConfig.js'
import { AuthBootstrapError } from '../../utils/errors.js'

export class AwsBootstrapBridge {
  constructor(private readonly config: UbersuggestAwsConfig) {}

  async bootstrap(input: BrowserBootstrapInput, feature: FeatureName = 'bootstrap'): Promise<BrowserBootstrapResult> {
    if (!this.config.awsBootstrapUrl) {
      throw new AuthBootstrapError('AWS bootstrap backend is not configured')
    }

    let lastError: unknown
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await fetch(this.config.awsBootstrapUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(this.config.awsBootstrapSharedSecret ? { 'x-bootstrap-secret': this.config.awsBootstrapSharedSecret } : {}),
          },
          body: JSON.stringify({ input, feature }),
          signal: AbortSignal.timeout(this.config.requestTimeoutMs),
        })

        let body: { ok?: boolean; result?: BrowserBootstrapResult; message?: string } | undefined
        try {
          body = await response.json<{ ok?: boolean; result?: BrowserBootstrapResult; message?: string }>()
        } catch {
          throw new AuthBootstrapError(`AWS bootstrap response was not valid JSON (status ${response.status})`)
        }

        if (!response.ok || !body?.result) {
          throw new AuthBootstrapError(body?.message ?? `AWS bootstrap request failed with status ${response.status}`)
        }

        validateBootstrapResult(body.result)
        return body.result
      } catch (error) {
        lastError = error
        if (attempt === 2) {
          break
        }
      }
    }

    throw lastError instanceof AuthBootstrapError
      ? lastError
      : new AuthBootstrapError(lastError instanceof Error ? lastError.message : String(lastError))
  }
}

function validateBootstrapResult(result: BrowserBootstrapResult): void {
  if (!result.cookiesHeader || !result.authorizationBearer || !result.xUbsData) {
    throw new AuthBootstrapError('AWS bootstrap response is missing required auth fields')
  }
  if (!result.capturedAt || !result.lastValidatedAt) {
    throw new AuthBootstrapError('AWS bootstrap response is missing required timestamps')
  }
}
