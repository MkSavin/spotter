import { api } from './api'

/** Decodes a base64url VAPID key into the ArrayBuffer `subscribe` expects. */
function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const buffer = new ArrayBuffer(raw.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i += 1) view[i] = raw.charCodeAt(i)
  return buffer
}

/** Serializes a browser PushSubscription into the keys the server stores. */
function serialize(subscription: PushSubscription) {
  const json = subscription.toJSON()
  return {
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
  }
}

export const pushSupported = (): boolean =>
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

export const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  // iOS Safari exposes standalone via a non-standard navigator flag.
  (navigator as { standalone?: boolean }).standalone === true

export const getRegistration = (): Promise<ServiceWorkerRegistration> =>
  navigator.serviceWorker.ready

/**
 * Subscribes the device to push and registers it server-side. Must be called
 * from a user gesture — `Notification.requestPermission` requires it on iOS.
 * Returns the stored subscription status.
 */
export async function subscribeDevice(deviceLabel?: string) {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(`permission ${permission}`)
  }

  const registration = await getRegistration()
  const existing = await registration.pushManager.getSubscription()

  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBuffer(await api.vapidPublicKey()),
    }))

  return api.subscribe(serialize(subscription), deviceLabel)
}

/** Removes the local push subscription and its server-side record. */
export async function unsubscribeDevice(): Promise<void> {
  const registration = await getRegistration()
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  await api.unsubscribe(subscription.endpoint)
  await subscription.unsubscribe()
}

export async function currentEndpoint(): Promise<string | null> {
  const registration = await getRegistration()
  const subscription = await registration.pushManager.getSubscription()
  return subscription?.endpoint ?? null
}
