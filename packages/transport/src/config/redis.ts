import process from 'node:process'
import { env } from '../helpers/env'

export type RedisConfig = {
  url: string
  group: string
  // Consumer name within the group. Must be unique per running instance so two
  // replicas (e.g. depot-1/depot-2) don't share a pending-entries list.
  consumer: string
  blockMs: number
  count: number
  reclaimMinIdleMs: number
  reaperIntervalMs: number
  maxDeliveries: number
  maxLen: number
}

// Reads the REDIS_* env block shared by all three services. `group` is the
// consumer-group default (one per service); `clientId` seeds the per-instance
// consumer name.
export const resolveRedisConfig = (defaults: {
  group: string
  clientId: string
}): RedisConfig => {
  const clientId = env.string('REDIS_CLIENT_ID', defaults.clientId)

  return {
    url: env.string('REDIS_URL', 'redis://localhost:6379'),
    group: env.string('REDIS_GROUP_ID', defaults.group),
    consumer: env.string('REDIS_CONSUMER', `${clientId}-${process.pid}`),
    blockMs: env.number('REDIS_BLOCK_MS', 5000),
    count: env.number('REDIS_COUNT', 10),
    reclaimMinIdleMs: env.number('REDIS_RECLAIM_MIN_IDLE_MS', 300000),
    reaperIntervalMs: env.number('REDIS_REAPER_INTERVAL_MS', 60000),
    maxDeliveries: env.number('REDIS_MAX_DELIVERIES', 5),
    maxLen: env.number('REDIS_MAXLEN', 10000),
  }
}
