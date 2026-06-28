import { UbersuggestClient } from '../../client/ubersuggestClient.js'
import type { SubscriptionResponse } from '../types/endpoints.js'

export class SubscriptionService {
  constructor(private readonly client: UbersuggestClient) {}

  async getSubscription(): Promise<SubscriptionResponse> {
    const response = await this.client.get<Record<string, unknown>>('/api/subscription', {
      feature: 'bootstrap',
    })

    return {
      tier: String(response.data.tier ?? ''),
      planInterval: String(response.data.planInterval ?? ''),
      planCode: String(response.data.planCode ?? ''),
      subscriptionStatus: String(response.data.subscriptionStatus ?? ''),
      currency: String(response.data.currency ?? ''),
    }
  }
}
