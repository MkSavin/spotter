import type { ServiceStatus } from '@spotter/transport'

/**
 * Where the PWA lives, if one is running and reachable.
 *
 * Taken from the PWA's own heartbeat rather than the bot's config: the two
 * would drift the first time the address moves, and a login link pointing at
 * the wrong host is worse than no link at all.
 *
 * Only online instances count. Offering a link to an install that stopped
 * reporting sends a person to a page that will not load.
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
