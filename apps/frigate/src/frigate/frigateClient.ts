import type { FrigateMediaConfig } from '../config'
import jwt from '../helpers/jwt'

/**
 * URL templates for the Frigate REST API. The only place that encodes Frigate's
 * URL scheme — porting the old bot-side `FrigateEndpoint`.
 */
export const frigateUrls = {
  clip: '{host}/api/events/{id}/clip.mp4',
  snapshot: '{host}/api/events/{id}/snapshot.jpg',
  event: '{host}/api/events/{id}',
  // A frame pulled from the continuous recording, for events too short for
  // Frigate to have written a snapshot of their own.
  recordingFrame: '{host}/api/{camera}/recordings/{time}/snapshot.jpg',
  latestFrame: '{host}/api/{camera}/latest.jpg',
  config: '{host}/api/config',
  version: '{host}/api/version',
  // Live camera/detector counters: the only way to learn the NVR lost video.
  stats: '{host}/api/stats',
  // Manual events: real recordings, but no `frigate/events` MQTT update — the
  // caller publishes the canonical event itself.
  createEvent: '{host}/api/events/{camera}/{label}/create',
  endEvent: '{host}/api/events/{id}/end',
  // Recording exports. `exportFile` is served by Frigate's nginx, not the API,
  // so it takes a bare file name rather than the container-internal path the
  // export record reports.
  exportStart: '{host}/api/export/{camera}/start/{start}/end/{end}',
  exportList: '{host}/api/exports',
  exportDelete: '{host}/api/export/{id}',
  exportFile: '{host}/exports/{file}',
} as const

/**
 * Strips trailing slashes and query noise from the configured host URL.
 *
 * Hand-rolled rather than `new URL()`: the value may carry a path prefix behind
 * a reverse proxy, which `origin` would discard. The port matters — the earlier
 * character class excluded `:`, so `http://frigate:5000/` kept its slash and
 * every request went to `//api/...`.
 */
export const normalizeHostUrl = (hostUrl: string): string =>
  hostUrl.trim().replace(/\?.*$/, '').replace(/\/+$/, '')

/** Substitutes `{host}` and named params into a Frigate URL template. */
export const settleUrl = (
  template: string,
  host: string,
  params: Record<string, string> = {},
): string => {
  let result = template.replaceAll('{host}', normalizeHostUrl(host))
  for (const [key, value] of Object.entries(params)) {
    result = result.replaceAll(`{${key}}`, value)
  }
  return result
}

/**
 * Mints a short-lived Frigate JWT. The secret never leaves this process — only
 * staged S3 keys travel downstream.
 *
 * Frigate requires `sub`, `role` and `exp`, and rejects the token outright when
 * any is missing — a token without `role` fails no matter how right the secret
 * is. Timestamps are whole seconds because it compares them as integers.
 */
export const mintFrigateJwt = (config: FrigateMediaConfig): string => {
  const now = Math.floor(Date.now() / 1000)

  return jwt.sign(
    {
      sub: config.authUser,
      role: config.authRole,
      iat: now,
      exp: now + 60 * 60 * 3,
    },
    config.authSecret || '',
    { algorithm: 'HS256' },
  )
}

/** Authorization header carrying a fresh Frigate JWT. */
export const frigateAuthHeaders = (
  config: FrigateMediaConfig,
): Record<string, string> => ({
  Authorization: `Bearer ${mintFrigateJwt(config)}`,
})

/** Builds an authenticated `Request` for a Frigate media artifact. */
export const frigateMediaRequest = (
  config: FrigateMediaConfig,
  template: string,
  params: Record<string, string>,
): Request =>
  new Request(settleUrl(template, config.remoteUrl, params), {
    headers: frigateAuthHeaders(config),
  })
