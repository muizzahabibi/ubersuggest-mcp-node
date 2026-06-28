import type { OAuthAuthorizationRequest } from '../domain/types/oauth.js'

export interface RuntimeOAuthUserRecord {
  username: string
  passwordHash: string
  passwordSalt: string
  createdAt: number
  updatedAt: number
  createdBy: string
  status: 'active'
}

export interface OAuthInviteRecord {
  codeHash: string
  username: string
  createdAt: number
  expiresAt: number
  createdBy: string
  status: 'pending' | 'redeemed'
  redeemedAt?: number
}

export interface OAuthAuthorizeRequestRecord {
  codeHash: string
  authRequest: OAuthAuthorizationRequest
  createdAt: number
  expiresAt: number
  status: 'pending' | 'consumed'
  consumedAt?: number
}

export interface OAuthConnectCodeRecord {
  codeHash: string
  subject: string
  username: string
  createdAt: number
  expiresAt: number
  status: 'pending' | 'consumed'
  consumedAt?: number
}

export interface McpBearerTokenRecord {
  tokenId: string
  tokenHash: string
  subject: string
  username: string
  label?: string
  createdAt: number
  lastUsedAt?: number
  expiresAt?: number
  revokedAt?: number
  createdBy: string
  status: 'active' | 'revoked'
}

export interface OAuthManageCodeRecord {
  codeHash: string
  subject: string
  username: string
  createdAt: number
  expiresAt: number
  status: 'active' | 'revoked'
  revokedAt?: number
}

export interface OAuthIdentityStore {
  getUser(username: string): Promise<RuntimeOAuthUserRecord | undefined>
  getInviteByCodeHash(codeHash: string): Promise<OAuthInviteRecord | undefined>
  createInvite(invite: OAuthInviteRecord): Promise<void>
  redeemInvite(invite: OAuthInviteRecord, user: RuntimeOAuthUserRecord, redeemedAt: number): Promise<void>
  getAuthorizeRequestByCodeHash(codeHash: string): Promise<OAuthAuthorizeRequestRecord | undefined>
  createAuthorizeRequest(authorizeRequest: OAuthAuthorizeRequestRecord): Promise<void>
  consumeAuthorizeRequest(authorizeRequest: OAuthAuthorizeRequestRecord, consumedAt: number): Promise<void>
  getConnectCodeByCodeHash(codeHash: string): Promise<OAuthConnectCodeRecord | undefined>
  createConnectCode(connectCode: OAuthConnectCodeRecord): Promise<void>
  consumeConnectCode(connectCode: OAuthConnectCodeRecord, consumedAt: number): Promise<void>
  getMcpBearerTokenByHash(tokenHash: string): Promise<McpBearerTokenRecord | undefined>
  listMcpBearerTokens(subject: string): Promise<McpBearerTokenRecord[]>
  createMcpBearerToken(token: McpBearerTokenRecord): Promise<void>
  touchMcpBearerToken(tokenId: string, lastUsedAt: number): Promise<void>
  revokeMcpBearerToken(tokenId: string, revokedAt: number): Promise<void>
  getManageCodeByCodeHash(codeHash: string): Promise<OAuthManageCodeRecord | undefined>
  createManageCode(manageCode: OAuthManageCodeRecord): Promise<void>
}
