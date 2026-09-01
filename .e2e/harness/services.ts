import {
  CatalogCache,
  CommandBus,
  HeartbeatRegistry,
  RedisConnection,
  RedisRegulator,
  StreamProducer,
} from '@spotter/transport'
import { defaultLogger } from 'stenograph'

/**
 * Runs the services' real controllers against a real Redis.
 *
 * Each service is composed the way its own entrypoint composes it — the same
 * controllers over the same regulator — rather than reimplemented. What is not
 * exercised here is the process shell: `index.ts` ends in `process.exit`, so it
 * cannot be started and stopped inside a test runner. That gap is what the
 * compose-level smoke test covers.
 */
export type ServiceHandle = {
  stop: () => Promise<void>
}

export type Wiring = {
  redisUrl: string
  logger?: typeof defaultLogger
}

const REGULATOR = {
  group: 'e2e',
  consumer: 'e2e-1',
  blockMs: 100,
  count: 10,
  // Short, so a reclaim test does not have to wait five minutes.
  reclaimMinIdleMs: 1_000,
  reaperIntervalMs: 500,
  maxDeliveries: 3,
}

export const connect = async (url: string) => {
  const subscriber = new RedisConnection(url)
  const producer = new StreamProducer(new RedisConnection(url), 1000)
  await producer.connect()
  await subscriber.connect()
  return { subscriber, producer }
}

export type Composed = {
  producer: StreamProducer
  subscriber: RedisConnection
  regulator: RedisRegulator<never>
  catalog: CatalogCache
  heartbeats: HeartbeatRegistry
  commandBus?: CommandBus
}

/** Boots a regulator over the given wiring and returns a stop handle. */
export const runRegulator = async <T>(
  regulator: RedisRegulator<T>,
  context: T,
  group: string,
): Promise<ServiceHandle> => {
  const transport = await regulator.run(context, {
    ...REGULATOR,
    group,
    consumer: `${group}-1`,
  })

  return { stop: async () => void (await transport.stop()) }
}

export const quietLogger = () => {
  defaultLogger.disable()
  return defaultLogger
}
