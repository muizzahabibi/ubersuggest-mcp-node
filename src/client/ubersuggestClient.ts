import { buildRequestInit, buildUrl } from './requestPolicy.js'
import { parseRateLimitState } from './rateLimitState.js'
import type { UbersuggestAwsConfig } from '../config/loadConfig.js'
import type { RequestOptions } from '../domain/types/common.js'
import type { ApiRequestResult } from '../domain/types/endpoints.js'
import { ApiError, ReconnectRequiredError, ResponseValidationError } from '../utils/errors.js'
import type { Logger } from '../utils/logging.js'
import { SessionResolver } from '../auth/sessionResolver.js'
import { ReconnectCoordinator } from '../auth/reconnectCoordinator.js'

export class UbersuggestClient {
  constructor(
    private readonly config: UbersuggestAwsConfig,
    private readonly sessionId: string,
    private readonly sessionResolver: SessionResolver,
    private readonly reconnectCoordinator: ReconnectCoordinator,
    private readonly logger: Logger,
  ) {}

  get<T>(path: string, options: Omit<RequestOptions, 'sessionId'>): Promise<ApiRequestResult<T>> {
    return this.request<T>('GET', path, options)
  }

  post<T>(path: string, options: Omit<RequestOptions, 'sessionId'>): Promise<ApiRequestResult<T>> {
    return this.request<T>('POST', path, options)
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    options: Omit<RequestOptions, 'sessionId'>,
  ): Promise<ApiRequestResult<T>> {
    const url = buildUrl(this.config.baseUrl, path, options.query)
    let session = await this.sessionResolver.getValidSession(this.sessionId, options.feature)
    this.logger.info('API request', {
      method,
      url,
      feature: options.feature,
    })
    let response = await fetch(url, {
      ...buildRequestInit(this.config, session, method, {
        ...options,
        sessionId: this.sessionId,
      }),
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    })

    this.logger.info('API response', {
      method,
      url,
      status: response.status,
      sessionId: this.sessionId,
    })

    if (response.status === 401 || response.status === 403) {
      this.logger.warn('Received auth failure from API; revalidating stored session', {
        path,
        status: response.status,
        sessionId: this.sessionId,
      })
      this.logger.diagnosticEvent(this.config.diagnosticLogging, 'Upstream auth failure triggered revalidation', {
        path,
        status: response.status,
        sessionId: this.sessionId,
      })

      try {
        session = await this.sessionResolver.revalidateSession(this.sessionId, session, options.feature)
      } catch (error) {
        if (error instanceof ReconnectRequiredError) {
          const reason = `Request to ${path} returned ${response.status}; stored Ubersuggest auth could not be refreshed and Ubersuggest reconnect is required.`
          await this.reconnectCoordinator.markReconnectRequired(this.sessionId, reason)
          throw new ReconnectRequiredError(reason, this.sessionId)
        }
        throw error
      }

      response = await fetch(url, {
        ...buildRequestInit(this.config, session, method, {
          ...options,
          sessionId: this.sessionId,
        }),
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      })
      this.logger.diagnosticEvent(this.config.diagnosticLogging, 'Retried upstream request after session revalidation', {
        path,
        status: response.status,
        sessionId: this.sessionId,
      })
    }

    const rateLimitState = parseRateLimitState(response.headers)
    await this.sessionResolver.updateRateLimitState(this.sessionId, rateLimitState)
    const responseReferer = response.headers.get('referer')
    if (responseReferer) {
      await this.sessionResolver.updateReferer(this.sessionId, options.feature, responseReferer)
    }

    const responseBody = await parseResponseBody(response)
    if (!response.ok) {
      throw new ApiError(`Request to ${path} failed with status ${response.status}`, response.status, responseBody)
    }

    return {
      status: response.status,
      data: responseBody as T,
      headers: headersToRecord(response.headers),
    }
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new ResponseValidationError(`Expected JSON response but received non-JSON content from ${response.url}`)
  }
}

function headersToRecord(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach((value, key) => {
    result[key] = value
  })
  return result
}
