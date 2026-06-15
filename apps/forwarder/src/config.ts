import { env, resolveRedisConfig } from '@spotter/transport'
import information from '../package.json'
import { applicationLogger } from './log'

export type ForwarderConfig = {
  /** Local-side Redis (durable AOF, localhost) — never crosses the network. */
  localUrl: string
  /** Remote-side Redis, reached over the fragile WAN hop (inside a VPN tunnel). */
  remoteUrl: string

  /** Consumer-group names, one per mirroring direction. */
  group: { up: string; down: string }
  /** Consumer name, unique per running instance. */
  consumer: string

  blockMs: number
  count: number
  reclaimMinIdleMs: number
  reaperIntervalMs: number
  maxDeliveries: number
  maxLen: number
}

/**
 * Resolves the forwarder config. Unlike the other services it bridges two Redis
 * instances, so it reads `REDIS_LOCAL_URL` / `REDIS_REMOTE_URL` explicitly while
 * reusing the shared `REDIS_*` tuning block via {@link resolveRedisConfig}.
 */
export const resolveConfig = (): ForwarderConfig => {
  const base = resolveRedisConfig({
    group: 'spotter-forwarder',
    clientId: information.name,
  })

  const result: ForwarderConfig = {
    localUrl: env.string('REDIS_LOCAL_URL', base.url),
    remoteUrl: env.string('REDIS_REMOTE_URL', ''),
    group: { up: 'spotter-forwarder-up', down: 'spotter-forwarder-down' },
    consumer: base.consumer,
    blockMs: base.blockMs,
    count: base.count,
    reclaimMinIdleMs: base.reclaimMinIdleMs,
    reaperIntervalMs: base.reaperIntervalMs,
    maxDeliveries: base.maxDeliveries,
    maxLen: base.maxLen,
  }

  if (!result.localUrl) {
    throw new Error('Bad configuration. No local redis url found.')
  }
  if (!result.remoteUrl) {
    throw new Error('Bad configuration. No remote redis url found.')
  }

  applicationLogger.verbose('Using core configuration:', result)

  return result
}
