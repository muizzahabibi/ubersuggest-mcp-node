export interface AuthorizationCodeRecord {
  codeId: string
  clientId: string
  redirectUri: string
  subject: string
  expiresAt: number
  createdAt: number
  consumedAt?: number
}

export interface AuthorizationCodeStore {
  createCode(record: AuthorizationCodeRecord): Promise<void>
  consumeCode(codeId: string): Promise<AuthorizationCodeRecord | undefined>
}
