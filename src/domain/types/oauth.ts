export interface AuthenticatedPrincipal {
  subject: string
  username: string
}

export interface OAuthAuthorizationRequest {
  clientId: string
  redirectUri: string
  state?: string
  scope: string
  codeChallenge: string
  codeChallengeMethod: 'S256'
  resource?: string
}

export interface OAuthUrls {
  issuer: string
  authorizeUrl: string
  tokenUrl: string
  registrationUrl: string
  authorizationServerMetadataUrl: string
  openIdConfigurationUrl: string
  protectedResourceMetadataUrl: string
  resource: string
}

export interface AccessTokenClaims {
  iss: string
  aud: string
  sub: string
  username: string
  scope: string
  exp: number
  iat: number
  token_use: 'access'
}

export interface AuthorizationCodeClaims {
  iss: string
  aud: string
  sub: string
  username: string
  scope: string
  exp: number
  iat: number
  token_use: 'authorization_code'
  client_id: string
  redirect_uri: string
  code_challenge: string
  code_challenge_method: 'S256'
  resource?: string
}

export interface OAuthClientRegistration {
  client_name?: string
  redirect_uris: string[]
  grant_types?: string[]
  response_types?: string[]
  token_endpoint_auth_method?: 'none'
}
