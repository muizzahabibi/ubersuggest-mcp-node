import type { AuthenticatedPrincipal } from '../domain/types/oauth.js'

export function buildUserSessionId(subject: string): string {
  return `user:${subject}`
}

export function createPrincipal(username: string): AuthenticatedPrincipal {
  return {
    subject: username,
    username,
  }
}

export function getSubjectFromSessionId(sessionId: string): string {
  return sessionId.startsWith('user:') ? sessionId.slice('user:'.length) : sessionId
}
