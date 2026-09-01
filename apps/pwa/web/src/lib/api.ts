import { forget, token } from './session'
import type {
  CameraEntry,
  FeedEntry,
  Role,
  ServiceStatus,
  SubscriptionStatus,
} from './types'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {}
  if (init?.body) headers['content-type'] = 'application/json'

  const bearer = token()
  if (bearer) headers.Authorization = `Bearer ${bearer}`

  const response = await fetch(path, { ...init, headers })

  if (!response.ok) {
    // The grant is gone (revoked, or the service lost its database): drop it
    // so the app asks for a code instead of retrying forever.
    if (response.status === 401) forget()

    const body = (await response.json().catch(() => ({}))) as {
      error?: string
    }
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

  authorize: (deviceId: string, code: string, label?: string) =>
    request<{ ok: boolean; token: string; role: Role }>('/api/auth', {
      method: 'POST',
      body: JSON.stringify({ deviceId, code, label }),
    }),

  cameras: () =>
    request<{ cameras: CameraEntry[] }>('/api/cameras').then((r) => r.cameras),

  status: () =>
    request<{ services: ServiceStatus[] }>('/api/status').then(
      (r) => r.services,
    ),

  snapshot: (camera: string) =>
    request<{ ok: boolean }>('/api/snapshot', {
      method: 'POST',
      body: JSON.stringify({ camera }),
    }),

  clip: (eventId: string) =>
    request<{ ok: boolean }>('/api/clip', {
      method: 'POST',
      body: JSON.stringify({ eventId }),
    }),
}
