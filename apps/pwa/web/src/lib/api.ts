import type { FeedEntry, SubscriptionStatus } from './types'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    ...init,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new ApiError(response.status, body.error ?? response.statusText)
  }
  return response.json() as Promise<T>
}

export type PushKeys = { endpoint: string; p256dh: string; auth: string }

export const api = {
  vapidPublicKey: () =>
    request<{ publicKey: string }>('/api/vapid').then((r) => r.publicKey),

  events: () =>
    request<{ events: FeedEntry[] }>('/api/events').then((r) => r.events),

  event: (id: string) =>
    request<FeedEntry>(`/api/events/${encodeURIComponent(id)}`),

  subscriptionStatus: (endpoint: string) =>
    request<{
      subscribed: boolean
      authorized?: boolean
      deviceLabel?: string | null
    }>(`/api/subscription?endpoint=${encodeURIComponent(endpoint)}`),

  subscribe: (subscription: PushKeys, deviceLabel?: string) =>
    request<SubscriptionStatus>('/api/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription, deviceLabel }),
    }),

  unsubscribe: (endpoint: string) =>
    request<{ ok: boolean }>('/api/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint }),
    }),

  testPush: (endpoint: string) =>
    request<{ ok: boolean }>('/api/test-push', {
      method: 'POST',
      body: JSON.stringify({ endpoint }),
    }),

  authorize: (endpoint: string, code: string) =>
    request<{ ok: boolean; authorized: boolean }>('/api/auth', {
      method: 'POST',
      body: JSON.stringify({ endpoint, code }),
    }),
}
