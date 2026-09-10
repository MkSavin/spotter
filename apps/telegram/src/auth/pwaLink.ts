import type { ServiceStatus } from '@spotter/transport'

/**
 * From the PWA's own heartbeat, not our config, which would drift. Online
 * instances only: a link to a stopped install leads to a page that never loads.
 */
export const pwaUrl = (services: ServiceStatus[]): string | null => {
  const found = services.find(
    (service) => service.service === 'pwa' && service.online,
  )

  const url = found?.details?.url?.trim()
  if (!url) return null

  // Only absolute http(s): the value comes off the bus, and a link is
  // something a person is about to tap.
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return url.replace(/\/+$/, '')
  } catch {
    return null
  }
}

/** One-tap login link for the PWA. */
export const authorizeLink = (base: string, code: string): string =>
  `${base}/authorize?code=${encodeURIComponent(code)}`
