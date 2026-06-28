import { UbersuggestClient } from '../../client/ubersuggestClient.js'
import type { FeatureName } from '../types/session.js'

export class RawUbersuggestService {
  constructor(private readonly client: UbersuggestClient) {}

  get(path: string, feature: FeatureName, query?: Record<string, string | number | boolean | undefined>) {
    return this.client.get<unknown>(path, { feature, query }).then((response) => response.data)
  }

  post(path: string, feature: FeatureName, body?: unknown) {
    return this.client.post<unknown>(path, { feature, body }).then((response) => response.data)
  }
}
