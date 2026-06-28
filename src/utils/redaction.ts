const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/Authorization:\s*Bearer\s+[^\s]+/gi, 'Authorization: Bearer <redacted>'],
  [/(authorizationBearer"?\s*[:=]\s*")([^"]+)(")/gi, '$1<redacted>$3'],
  [/(x-ubs-data"?\s*[:=]\s*")([^"]+)(")/gi, '$1<redacted>$3'],
  [/(xUbsData"?\s*[:=]\s*")([^"]+)(")/gi, '$1<redacted>$3'],
  [/X-UBS-Data:\s*[^\s]+/gi, 'X-UBS-Data: <redacted>'],
  [/(cookiesHeader"?\s*[:=]\s*")([^"]+)(")/gi, '$1<redacted>$3'],
  [/(cookies"?\s*[:=]\s*")([^"]+)(")/gi, '$1<redacted>$3'],
  [/(cookie"?\s*[:=]\s*")([^"]+)(")/gi, '$1<redacted>$3'],
  [/Cookie:\s*[^\r\n]+/gi, 'Cookie: <redacted>'],
  [/\b([A-Za-z0-9._-]+)=([^;,\s"]+)/g, '$1=<redacted>'],
]

export function redactText(value: string): string {
  return SECRET_PATTERNS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value)
}

export function redactValue<T>(value: T): T {
  if (typeof value === 'string') {
    return redactText(value) as T
  }

  return JSON.parse(redactText(JSON.stringify(value))) as T
}
