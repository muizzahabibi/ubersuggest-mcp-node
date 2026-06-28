import type { AuthBundle, BrowserBootstrapInput } from '../domain/types/session.js'

export interface AuthBundleStore {
  getAuthBundle(secretId: string): Promise<AuthBundle | undefined>
  getBootstrapInput(secretId: string): Promise<BrowserBootstrapInput | undefined>
  putAuthBundle(secretId: string, bundle: AuthBundle, bootstrapInput?: BrowserBootstrapInput): Promise<void>
  deleteAuthBundle(secretId: string): Promise<void>
}
