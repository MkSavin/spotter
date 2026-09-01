import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { eventStreams, deliveryStreams } from '@spotter/transport'
import { defaultLogger } from 'stenograph'

import { fakeS3 } from './harness/externals'
import { dockerAvailable, type RedisHandle, startRedis } from './harness/redis'
import { connect } from './harness/services'
import { runServer } from './harness/topology'
import type { SpotterEvent } from '@spotter/transport'

if (!process.env.E2E_VERBOSE) defaultLogger.disable()

const usable = await dockerAvailable()
const describeIfDocker = usable ? describe : describe.skip

const event = (id: string): SpotterEvent => ({
  id,
  source: 'frigate',
  camera: 'front',
  label: 'person',
  startTime: Math.floor(Date.now() / 1000),
  endTime: null,
  score: 0.9,
  stationary: false,
  hasClip: false,
  hasSnapshot: true,
  type: 'start',
})

const until = async <T>(
  check: () => T | Promise<T>,
  what: string,
  timeoutMs = 20_000,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await check().catch(() => null as T)
    if (value) return value
    await Bun.sleep(200)
  }
  throw new Error(`timed out waiting for ${what}`)
}

const countDeliveries = async (
  connection: Awaited<ReturnType<typeof connect>>,
): Promise<number> => {
  const entries = (await connection.producer.send('XRANGE', [
    deliveryStreams.deliveryEvent,
    '-',
    '+',
  ])) as unknown[] | null
  return entries?.length ?? 0
}

/**
 * Watchtower restarts anything at any time, so the question is never whether a
 * service survives its own restart but whether it survives everyone else's.
 */
describeIfDocker('recovery', () => {
  let redis: RedisHandle
  let stops: Array<() => Promise<void>> = []
  let connection: Awaited<ReturnType<typeof connect>>

  beforeAll(async () => {
    redis = await startRedis(7110)
    const server = await runServer(redis.url, fakeS3())
    stops = [server.stop]
    connection = await connect(redis.url)
  })

  afterAll(async () => {
    // A wedged consumer does not stop promptly — that is the bug under test,
    // so teardown must not hang the suite waiting for it.
    await Promise.race([
      Promise.all(stops.map((stop) => stop())),
      Bun.sleep(3_000),
    ])
    connection?.subscriber.close()
    connection?.producer.disconnect()
    await redis?.stop()
  }, 30_000)

  // KNOWN FAILURE — kept as the reproduction, not deleted to make the suite
  // green. Destroying and recreating the Redis *container* (what an update
  // does) leaves the consumer stuck: `FLUSHALL` alone recovers, losing the
  // connection as well does not. See .e2e/README.md.
  test.failing('a service outlives Redis going away entirely', async () => {
    await connection.producer.publish(eventStreams.event, event('before'))
    await until(async () => (await countDeliveries(connection)) >= 1, 'first')

    // Not a blip: the container is destroyed, which is what an update does.
    await redis.kill()
    await Bun.sleep(1_000)
    await redis.revive()

    const revived = await connect(redis.url)

    await until(async () => {
      await revived.producer
        .publish(eventStreams.event, event(`after-${Date.now()}`))
        .catch(() => undefined)
      return (await countDeliveries(revived)) >= 1
    }, 'delivery after the restart')

    revived.subscriber.close()
    revived.producer.disconnect()
  }, 60_000)
})
