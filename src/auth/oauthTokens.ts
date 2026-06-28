import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { AccessTokenClaims, AuthorizationCodeClaims } from '../domain/types/oauth.js'
import { AuthError } from '../utils/errors.js'

const TOKEN_HEADER = { alg: 'HS256', typ: 'JWT' }

type SupportedClaims = AccessTokenClaims | AuthorizationCodeClaims

function encodeBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url')
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function sign(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('base64url')
}

function encodeToken<T extends SupportedClaims>(claims: T, secret: string): string {
  const header = encodeBase64Url(JSON.stringify(TOKEN_HEADER))
  const payload = encodeBase64Url(JSON.stringify(claims))
  const signature = sign(`${header}.${payload}`, secret)
  return `${header}.${payload}.${signature}`
}

function decodeAndVerify<T extends SupportedClaims>(token: string, secret: string): T {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new AuthError('Token format is invalid')
  }

  const [header, payload, signature] = parts
  const expectedSignature = sign(`${header}.${payload}`, secret)
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new AuthError('Token signature is invalid')
  }

  const parsedHeader = JSON.parse(decodeBase64Url(header)) as { alg?: string; typ?: string }
  if (parsedHeader.alg !== 'HS256' || parsedHeader.typ !== 'JWT') {
    throw new AuthError('Token header is invalid')
  }

  return JSON.parse(decodeBase64Url(payload)) as T
}

export function issueAccessToken(claims: Omit<AccessTokenClaims, 'iat' | 'exp' | 'token_use'>, secret: string, ttlSeconds: number): string {
  const now = Math.floor(Date.now() / 1000)
  return encodeToken({
    ...claims,
    iat: now,
    exp: now + ttlSeconds,
    token_use: 'access',
  }, secret)
}

export function issueAuthorizationCode(claims: Omit<AuthorizationCodeClaims, 'iat' | 'exp' | 'token_use'>, secret: string, ttlSeconds: number): string {
  const now = Math.floor(Date.now() / 1000)
  return encodeToken({
    ...claims,
    iat: now,
    exp: now + ttlSeconds,
    token_use: 'authorization_code',
  }, secret)
}

function assertNotExpired(exp: number): void {
  const now = Math.floor(Date.now() / 1000)
  if (exp <= now) {
    throw new AuthError('Token has expired')
  }
}

export function verifyAccessToken(token: string, secret: string, expectedAudience: string): AccessTokenClaims {
  const claims = decodeAndVerify<AccessTokenClaims>(token, secret)
  if (claims.token_use !== 'access') {
    throw new AuthError('Access token type is invalid')
  }
  assertNotExpired(claims.exp)
  if (claims.aud !== expectedAudience) {
    throw new AuthError('Access token audience is invalid')
  }
  return claims
}

export function verifyAuthorizationCode(code: string, secret: string, expectedClientId: string, expectedRedirectUri: string): AuthorizationCodeClaims {
  const claims = decodeAndVerify<AuthorizationCodeClaims>(code, secret)
  if (claims.token_use !== 'authorization_code') {
    throw new AuthError('Authorization code type is invalid')
  }
  assertNotExpired(claims.exp)
  if (claims.client_id !== expectedClientId) {
    throw new AuthError('Authorization code client_id is invalid')
  }
  if (claims.redirect_uri !== expectedRedirectUri) {
    throw new AuthError('Authorization code redirect_uri is invalid')
  }
  return claims
}

export function verifyPkceCodeVerifier(codeVerifier: string, codeChallenge: string): boolean {
  const digest = createHash('sha256').update(codeVerifier).digest('base64url')
  const digestBuffer = Buffer.from(digest)
  const challengeBuffer = Buffer.from(codeChallenge)
  return digestBuffer.length === challengeBuffer.length && timingSafeEqual(digestBuffer, challengeBuffer)
}
