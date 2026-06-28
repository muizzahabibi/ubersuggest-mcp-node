import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { AuthenticatedPrincipal, OAuthAuthorizationRequest } from '../domain/types/oauth.js'
import type { UbersuggestAwsConfig } from '../config/loadConfig.js'
import type {
  McpBearerTokenRecord,
  OAuthAuthorizeRequestRecord,
  OAuthConnectCodeRecord,
  OAuthIdentityStore,
  OAuthInviteRecord,
  OAuthManageCodeRecord,
  RuntimeOAuthUserRecord,
} from '../stores/oauthIdentityStore.js'
import { AuthError } from '../utils/errors.js'

const scrypt = promisify(nodeScrypt)

export interface InviteDetails {
  username: string
  inviteCode: string
  inviteUrl: string
  expiresAt: number
}

export interface AuthorizeRequestDetails {
  authorizeCode: string
  authorizeUrl: string
  expiresAt: number
}

export interface ConnectCodeDetails {
  connectCode: string
  connectUrl: string
  expiresAt: number
}

export interface McpBearerTokenDetails {
  tokenId: string
  token: string
  label?: string
  createdAt: number
  expiresAt?: number
}

export class OAuthIdentityService {
  constructor(
    private readonly config: UbersuggestAwsConfig,
    private readonly store: OAuthIdentityStore,
  ) {}

  isBootstrapAdmin(username: string): boolean {
    return Boolean(this.config.oauthUsers[username])
  }

  async authenticateLogin(username: string, password: string): Promise<AuthenticatedPrincipal> {
    const bootstrapPassword = this.config.oauthUsers[username]
    if (bootstrapPassword && bootstrapPassword === password) {
      return { subject: username, username }
    }

    const user = await this.store.getUser(username)
    if (!user || user.status !== 'active') {
      throw new AuthError('Invalid username or password')
    }

    const matches = await verifyPassword(password, user.passwordSalt, user.passwordHash)
    if (!matches) {
      throw new AuthError('Invalid username or password')
    }

    return { subject: username, username }
  }

  async createInvite(username: string, principal: AuthenticatedPrincipal): Promise<InviteDetails> {
    this.ensureBootstrapAdmin(principal)
    await this.ensureUserDoesNotExist(username)

    const inviteCode = randomBytes(24).toString('base64url')
    const codeHash = hashOpaqueCode(inviteCode)
    const now = Date.now()
    const expiresAt = now + this.config.oauthInviteTtlSeconds * 1000

    await this.store.createInvite({
      codeHash,
      username,
      createdAt: now,
      expiresAt,
      createdBy: principal.username,
      status: 'pending',
    })

    return {
      username,
      inviteCode,
      inviteUrl: `${resolvePublicBaseUrl(this.config)}/invite?code=${encodeURIComponent(inviteCode)}`,
      expiresAt,
    }
  }

  async createAuthorizeRequest(authRequest: OAuthAuthorizationRequest): Promise<AuthorizeRequestDetails> {
    const authorizeCode = randomBytes(18).toString('base64url')
    const codeHash = hashOpaqueCode(authorizeCode)
    const now = Date.now()
    const expiresAt = now + this.config.oauthAuthorizationCodeTtlSeconds * 1000

    await this.store.createAuthorizeRequest({
      codeHash,
      authRequest,
      createdAt: now,
      expiresAt,
      status: 'pending',
    })

    return {
      authorizeCode,
      authorizeUrl: `${resolvePublicBaseUrl(this.config)}/login?code=${encodeURIComponent(authorizeCode)}`,
      expiresAt,
    }
  }

  async createConnectCode(principal: AuthenticatedPrincipal): Promise<ConnectCodeDetails> {
    const connectCode = randomBytes(18).toString('base64url')
    const codeHash = hashOpaqueCode(connectCode)
    const now = Date.now()
    const expiresAt = now + this.config.oauthAuthorizationCodeTtlSeconds * 1000

    await this.store.createConnectCode({
      codeHash,
      subject: principal.subject,
      username: principal.username,
      createdAt: now,
      expiresAt,
      status: 'pending',
    })

    return {
      connectCode,
      connectUrl: `${resolvePublicBaseUrl(this.config)}/cookies?code=${encodeURIComponent(connectCode)}`,
      expiresAt,
    }
  }

  async issueMcpBearerToken(principal: AuthenticatedPrincipal, label?: string, expiresAt?: number): Promise<McpBearerTokenDetails> {
    const tokenId = randomBytes(12).toString('base64url')
    const token = `ubs_mcp_${randomBytes(24).toString('base64url')}`
    const now = Date.now()

    await this.store.createMcpBearerToken({
      tokenId,
      tokenHash: hashOpaqueCode(token),
      subject: principal.subject,
      username: principal.username,
      label,
      createdAt: now,
      expiresAt,
      createdBy: principal.username,
      status: 'active',
    })

    return { tokenId, token, label, createdAt: now, expiresAt }
  }

  async getMcpBearerToken(token: string): Promise<McpBearerTokenRecord | undefined> {
    const record = await this.store.getMcpBearerTokenByHash(hashOpaqueCode(token))
    if (!record || record.status !== 'active') {
      return undefined
    }
    if (record.expiresAt && record.expiresAt <= Date.now()) {
      return undefined
    }
    return record
  }

  async touchMcpBearerToken(tokenId: string): Promise<void> {
    await this.store.touchMcpBearerToken(tokenId, Date.now())
  }

  async listMcpBearerTokens(principal: AuthenticatedPrincipal): Promise<McpBearerTokenRecord[]> {
    return this.store.listMcpBearerTokens(principal.subject)
  }

  async revokeMcpBearerToken(principal: AuthenticatedPrincipal, tokenId: string): Promise<void> {
    const token = (await this.store.listMcpBearerTokens(principal.subject)).find((entry) => entry.tokenId === tokenId)
    if (!token) {
      throw new AuthError('Token not found')
    }
    if (token.status === 'revoked') {
      return
    }
    await this.store.revokeMcpBearerToken(tokenId, Date.now())
  }

  async createManageCode(principal: AuthenticatedPrincipal): Promise<string> {
    const manageCode = randomBytes(18).toString('base64url')
    const codeHash = hashOpaqueCode(manageCode)
    const now = Date.now()
    const expiresAt = now + this.config.oauthAuthorizationCodeTtlSeconds * 1000

    await this.store.createManageCode({
      codeHash,
      subject: principal.subject,
      username: principal.username,
      createdAt: now,
      expiresAt,
      status: 'active',
    })

    return manageCode
  }

  async getManageCode(code: string): Promise<OAuthManageCodeRecord> {
    const manageCode = await this.store.getManageCodeByCodeHash(hashOpaqueCode(code))
    if (!manageCode || manageCode.status !== 'active') {
      throw new AuthError('Manage code is invalid or expired')
    }
    if (manageCode.expiresAt <= Date.now()) {
      throw new AuthError('Manage code has expired')
    }
    return manageCode
  }

  async getConnectCode(code: string): Promise<OAuthConnectCodeRecord> {
    const connectCode = await this.store.getConnectCodeByCodeHash(hashOpaqueCode(code))
    if (!connectCode || connectCode.status !== 'pending') {
      throw new AuthError('Connect code is invalid or already used')
    }
    if (connectCode.expiresAt <= Date.now()) {
      throw new AuthError('Connect code has expired')
    }
    return connectCode
  }

  async consumeConnectCode(code: string): Promise<AuthenticatedPrincipal> {
    const connectCode = await this.getConnectCode(code)
    await this.store.consumeConnectCode(connectCode, Date.now())
    return { subject: connectCode.subject, username: connectCode.username }
  }

  async getAuthorizeRequest(code: string): Promise<OAuthAuthorizeRequestRecord> {
    const authorizeRequest = await this.store.getAuthorizeRequestByCodeHash(hashOpaqueCode(code))
    if (!authorizeRequest || authorizeRequest.status !== 'pending') {
      throw new AuthError('Authorize request is invalid or already used')
    }
    if (authorizeRequest.expiresAt <= Date.now()) {
      throw new AuthError('Authorize request has expired')
    }
    return authorizeRequest
  }

  async consumeAuthorizeRequest(code: string): Promise<OAuthAuthorizationRequest> {
    const authorizeRequest = await this.getAuthorizeRequest(code)
    await this.store.consumeAuthorizeRequest(authorizeRequest, Date.now())
    return authorizeRequest.authRequest
  }

  async getInvite(code: string): Promise<OAuthInviteRecord> {
    const invite = await this.store.getInviteByCodeHash(hashOpaqueCode(code))
    if (!invite || invite.status !== 'pending') {
      throw new AuthError('Invite is invalid or already used')
    }
    if (invite.expiresAt <= Date.now()) {
      throw new AuthError('Invite has expired')
    }
    return invite
  }

  async redeemInvite(code: string, password: string): Promise<{ username: string }> {
    this.ensurePasswordLength(password)
    const invite = await this.getInvite(code)
    const now = Date.now()
    const user = await createRuntimeOAuthUser(invite, password, now)
    await this.store.redeemInvite(invite, user, now)
    return { username: invite.username }
  }

  private ensureBootstrapAdmin(principal: AuthenticatedPrincipal): void {
    if (!this.isBootstrapAdmin(principal.username)) {
      throw new AuthError('Only bootstrap admin users can create invites')
    }
  }

  private async ensureUserDoesNotExist(username: string): Promise<void> {
    const existingUser = await this.store.getUser(username)
    if (existingUser) {
      throw new AuthError('User already exists')
    }
  }

  private ensurePasswordLength(password: string): void {
    if (password.length < this.config.oauthPasswordMinLength) {
      throw new AuthError(`Password must be at least ${this.config.oauthPasswordMinLength} characters long`)
    }
  }
}

async function createRuntimeOAuthUser(invite: OAuthInviteRecord, password: string, now: number): Promise<RuntimeOAuthUserRecord> {
  const passwordSalt = randomBytes(16).toString('base64url')
  const passwordHash = await hashPassword(password, passwordSalt)
  return {
    username: invite.username,
    passwordHash,
    passwordSalt,
    createdAt: now,
    updatedAt: now,
    createdBy: invite.createdBy,
    status: 'active',
  }
}

function resolvePublicBaseUrl(config: UbersuggestAwsConfig): string {
  return (config.publicBaseUrl ?? 'http://localhost:8787').replace(/\/$/, '')
}

function hashOpaqueCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const derived = await scrypt(password, salt, 64)
  return Buffer.from(derived as ArrayBuffer).toString('base64')
}

async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const actualHash = await hashPassword(password, salt)
  return timingSafeEqual(Buffer.from(actualHash, 'base64'), Buffer.from(expectedHash, 'base64'))
}
