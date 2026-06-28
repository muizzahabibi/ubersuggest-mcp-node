import { ResponseValidationError } from './errors.js'

export function ensureRecord(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ResponseValidationError(`${context} must be a JSON object`)
  }

  return value as Record<string, unknown>
}

export function ensureArray(value: unknown, context: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ResponseValidationError(`${context} must be an array`)
  }

  return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
}

export function ensureString(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ResponseValidationError(`${context} must be a non-empty string`)
  }

  return value
}

export function ensureNumber(value: unknown, context: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ResponseValidationError(`${context} must be a number`)
  }

  return value
}

export function ensureBoolean(value: unknown, context: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ResponseValidationError(`${context} must be a boolean`)
  }

  return value
}
