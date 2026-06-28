import type { RateLimitState } from '../domain/types/session.js'

export function parseRateLimitState(headers: Headers | Record<string, string>): RateLimitState | undefined {
  const get = (name: string): string | undefined => {
    if (headers instanceof Headers) {
      return headers.get(name) ?? undefined
    }

    return headers[name.toLowerCase()] ?? headers[name] ?? undefined
  }

  const remaining = toNumber(get('x-ratelimit-remaining'))
  const resetAt = toNumber(get('x-ratelimit-reset'))
  const requestCost = toNumber(get('x-ratelimit-requestcost'))

  if (remaining === undefined && resetAt === undefined && requestCost === undefined) {
    return undefined
  }

  return { remaining, resetAt, requestCost }
}

function toNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
