const encoder = new TextEncoder()
const decoder = new TextDecoder()

export async function encryptJson(secret: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveAesKey(secret)
  const plain = encoder.encode(JSON.stringify(value))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, plain as unknown as BufferSource)
  return `${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`
}

export async function decryptJson<T>(secret: string, payload: string): Promise<T> {
  const [ivEncoded, cipherEncoded] = payload.split('.')
  if (!ivEncoded || !cipherEncoded) {
    throw new Error('Encrypted payload format is invalid')
  }

  const iv = fromBase64(ivEncoded)
  const cipher = fromBase64(cipherEncoded)
  const key = await deriveAesKey(secret)
  const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, cipher as unknown as BufferSource)
  return JSON.parse(decoder.decode(plainBuffer)) as T
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}
