export class UbersuggestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UbersuggestError'
  }
}

export class ConfigError extends UbersuggestError {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export class AuthBootstrapError extends UbersuggestError {
  constructor(message: string) {
    super(message)
    this.name = 'AuthBootstrapError'
  }
}

export class AuthError extends UbersuggestError {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

export class InvalidRequestError extends AuthError {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidRequestError'
  }
}

export class SessionOwnershipError extends UbersuggestError {
  constructor(message: string) {
    super(message)
    this.name = 'SessionOwnershipError'
  }
}

export class ApiError extends UbersuggestError {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class PollTimeoutError extends UbersuggestError {
  constructor(message: string) {
    super(message)
    this.name = 'PollTimeoutError'
  }
}

export class ResponseValidationError extends UbersuggestError {
  constructor(message: string) {
    super(message)
    this.name = 'ResponseValidationError'
  }
}

export class ReconnectRequiredError extends UbersuggestError {
  constructor(
    message: string,
    public readonly sessionId: string,
  ) {
    super(message)
    this.name = 'ReconnectRequiredError'
  }
}

export class SessionLockError extends UbersuggestError {
  constructor(message: string) {
    super(message)
    this.name = 'SessionLockError'
  }
}

export class NotFoundError extends UbersuggestError {
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}
