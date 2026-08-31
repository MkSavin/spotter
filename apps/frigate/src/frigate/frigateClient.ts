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

/** Strips trailing slash / query noise from the configured host URL. */
export const normalizeHostUrl = (hostUrl: string): string =>
  hostUrl.replaceAll(
    /^\s*((?:http|ftp)s?:\/\/[\w./]*?)\/?(?:\?.*)?\s*$/gi,
    '$1',
  )

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
 */
export const mintFrigateJwt = (config: FrigateMediaConfig): string =>
  jwt.sign(
    {
      sub: config.authUser,
      exp: Date.now() / 1000 + 60 * 60 * 3,
    },
    config.authSecret || '',
    { algorithm: 'HS256' },
  )

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
