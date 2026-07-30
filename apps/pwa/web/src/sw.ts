/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope

type PushPayload = {
  title: string
  body: string
  url: string
  tag?: string
}

const DEFAULT_PAYLOAD: PushPayload = {
  title: 'Spotter',
  body: 'Новое событие',
  url: '/',
}

const parsePayload = (event: PushEvent): PushPayload => {
  try {
    return { ...DEFAULT_PAYLOAD, ...(event.data?.json() as PushPayload) }
  } catch {
    return DEFAULT_PAYLOAD
  }
}

/** Tells any open app windows to refresh their feed. */
async function notifyClients(): Promise<void> {
  const clients = await self.clients.matchAll({ type: 'window' })
  for (const client of clients) client.postMessage({ type: 'event' })
}

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
)

self.addEventListener('push', (event) => {
  const payload = parsePayload(event)
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, {
        body: payload.body,
        // Same tag replaces an unshown notification instead of stacking.
        tag: payload.tag,
        data: { url: payload.url },
        icon: '/icons/icon-192.png',
        badge: '/icons/badge.png',
      }),
      notifyClients(),
    ]),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data?.url as string | undefined) ?? '/'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const open = clients.find((client) => 'focus' in client)
        if (open) {
          open.postMessage({ type: 'navigate', url })
          return open.focus()
        }
        return self.clients.openWindow(url)
      }),
  )
})
