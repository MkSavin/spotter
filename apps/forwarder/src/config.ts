import {
  env,
  redactConfig,
  requireConfig,
  resolveRedisConfig,
} from '@spotter/transport'
import information from '../package.json'
import { applicationLogger } from './log'

export type ForwarderConfig = {
  /** Local-side Redis (durable AOF, localhost) — never crosses the network. */
  localUrl: string
  /** Remote-side Redis, reached over the fragile WAN hop (via an SSH tunnel). */
  remoteUrl: string

  /** Source ids whose per-source request streams are mirrored remote → local. */
  sources: string[]

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

  const sources = env
    .string('FORWARDER_SOURCES', 'frigate')
    .split(',')
    .map((source) => source.trim())
    .filter(Boolean)

  const result: ForwarderConfig = {
    localUrl: env.string('REDIS_LOCAL_URL', base.url),
    remoteUrl: env.string('REDIS_REMOTE_URL', ''),
    sources,
    group: { up: 'spotter-forwarder-up', down: 'spotter-forwarder-down' },
    consumer: base.consumer,
    blockMs: base.blockMs,
    count: base.count,
    reclaimMinIdleMs: base.reclaimMinIdleMs,
    reaperIntervalMs: base.reaperIntervalMs,
    maxDeliveries: base.maxDeliveries,
    maxLen: base.maxLen,
  }

  requireConfig({
    REDIS_LOCAL_URL: result.localUrl,
    REDIS_REMOTE_URL: result.remoteUrl,
  })

  applicationLogger.verbose('Using core configuration:', redactConfig(result))

  return result
}
