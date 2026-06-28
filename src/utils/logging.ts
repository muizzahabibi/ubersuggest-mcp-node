import type { LogLevel } from '../domain/types/session.js'
import type { DiagnosticLoggingConfig } from '../config/loadConfig.js'
import { redactText } from './redaction.js'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

export class Logger {
  constructor(private readonly level: LogLevel) {}

  diagnostic(config: DiagnosticLoggingConfig, request: Request, routeType: string, message: string, details?: Record<string, unknown>): void {
    if (!shouldLogDiagnostic(config, request)) {
      return
    }

    this.info(message, {
      routeType,
      method: request.method,
      path: new URL(request.url).pathname,
      hasAuthorization: request.headers.has('authorization'),
      userAgent: request.headers.get('user-agent') || undefined,
      cfRay: request.headers.get('cf-ray') || undefined,
      cfConnectingIp: request.headers.get('cf-connecting-ip') || undefined,
      ...details,
    })
  }

  diagnosticEvent(config: DiagnosticLoggingConfig, message: string, details?: Record<string, unknown>): void {
    if (!config.enabled) {
      return
    }
    if (config.sampleRate <= 0 || Math.random() > config.sampleRate) {
      return
    }
    this.info(message, details)
  }


  log(level: LogLevel, message: string, details?: unknown): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) {
      return
    }

    const suffix = details === undefined ? '' : ` ${redactText(JSON.stringify(details))}`
    console.error(`[${level}] ${redactText(message)}${suffix}`)
  }

  debug(message: string, details?: unknown): void {
    this.log('debug', message, details)
  }

  info(message: string, details?: unknown): void {
    this.log('info', message, details)
  }

  warn(message: string, details?: unknown): void {
    this.log('warn', message, details)
  }

  error(message: string, details?: unknown): void {
    this.log('error', message, details)
  }
}

function shouldLogDiagnostic(config: DiagnosticLoggingConfig, request: Request): boolean {
  if (!config.enabled) {
    return false
  }

  const path = new URL(request.url).pathname
  if (config.routes.length > 0 && !config.routes.some((route) => path === route || path.startsWith(`${route}/`))) {
    return false
  }

  if (config.sampleRate <= 0) {
    return false
  }

  return Math.random() <= config.sampleRate
}
