import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  deliveryStreams,
  eventStreams,
  mediaStreams,
  type SpotterEvent,
} from '@spotter/transport'

import { dockerAvailable, type RedisHandle, startRedis } from './harness/redis'
import { fakeS3 } from './harness/externals'
import { connect } from './harness/services'
import { runDepot, runForwarder, runServer } from './harness/topology'
import { defaultLogger } from 'stenograph'

if (!process.env.E2E_VERBOSE) defaultLogger.disable()

const usable = await dockerAvailable()
const describeIfDocker = usable ? describe : describe.skip

if (!usable) {
  console.warn('e2e: docker unavailable, skipping')
}

const event = (id: string): SpotterEvent => ({
  id,
  source: 'frigate',
  camera: 'front',
  label: 'person',
  startTime: Math.floor(Date.now() / 1000),
  endTime: null,
  score: 0.9,
  stationary: false,
  hasClip: true,
  hasSnapshot: true,
  type: 'start',
})

/** Polls until `check` passes, so a test never sleeps longer than it must. */
const until = async <T>(
  check: () => T | Promise<T>,
  what: string,
  timeoutMs = 8_000,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs
  let last: T | undefined

  while (Date.now() < deadline) {
    last = await check()
    if (last) return last
    await Bun.sleep(100)
  }

  throw new Error(`timed out waiting for ${what} (last: ${String(last)})`)
}

const readStream = async (
  connection: Awaited<ReturnType<typeof connect>>,
  stream: string,
): Promise<unknown[]> => {
  const entries = (await connection.producer.send('XRANGE', [
    stream,
    '-',
    '+',
  ])) as Array<[string, string[]]> | null

  if (!entries) return []

  return entries.map(([, fields]) => {
    const index = fields.indexOf('value')
    return JSON.parse(fields[index + 1])
  })
}

// Both deployment shapes run the same assertions: what the product does must
// not depend on how it is spread across machines.
for (const topology of ['single', 'split'] as const) {
  describeIfDocker(`delivery (${topology})`, () => {
    let ingest: RedisHandle
    let cloud: RedisHandle
    let stops: Array<() => Promise<void>> = []
    let s3: ReturnType<typeof fakeS3>
    let cloudConnection: Awaited<ReturnType<typeof connect>>
    let ingestConnection: Awaited<ReturnType<typeof connect>>

    beforeAll(async () => {
      ingest = await startRedis(topology === 'single' ? 7101 : 7102)
      cloud = topology === 'single' ? ingest : await startRedis(7103)

      s3 = fakeS3()

      const server = await runServer(cloud.url, s3)
      const depot = await runDepot(ingest.url, s3)
      stops = [server.stop, depot.stop]

      if (topology === 'split') {
        const forwarder = await runForwarder(ingest.url, cloud.url, ['frigate'])
        stops.push(forwarder.stop)
      }

      ingestConnection = await connect(ingest.url)
      cloudConnection = await connect(cloud.url)
    })

    afterAll(async () => {
      for (const stop of stops) await stop()
      ingestConnection?.subscriber.close()
      ingestConnection?.producer.disconnect()
      cloudConnection?.subscriber.close()
      cloudConnection?.producer.disconnect()
      await ingest?.stop()
      if (topology === 'split') await cloud?.stop()
    })

    test('an ingested event reaches the cloud as a delivery', async () => {
      const spotterEvent = event(`e2e-${topology}-1`)

      // The adapter publishes on the ingest node, as it would in production.
      await ingestConnection.producer.publish(eventStreams.event, spotterEvent)

      const deliveries = await until(
        async () => {
          const all = await readStream(
            cloudConnection,
            deliveryStreams.deliveryEvent,
          )
          return all.length > 0 ? all : null
        },
        'delivery.event',
      )

      expect((deliveries[0] as { eventId: string }).eventId).toBe(
        spotterEvent.id,
      )
    })

    test('staged media is transcoded and comes back as processed', async () => {
      const eventId = `e2e-${topology}-media`

      await ingestConnection.producer.publish(eventStreams.event, event(eventId))

      // The adapter stages raw bytes and announces them; depot picks it up.
      await s3.seedImage('staging/frigate/raw.jpg')

      await ingestConnection.producer.publish(mediaStreams.mediaStaged, {
        eventId,
        source: 'frigate',
        rawSnapshotKey: 'staging/frigate/raw.jpg',
      })

      const processed = await until(
        async () => {
          const all = (await readStream(
            ingestConnection,
            mediaStreams.mediaProcessed,
          )) as Array<{ eventId: string; snapshotKey?: string }>
          return all.find((entry) => entry.eventId === eventId) ?? null
        },
        'media_processed',
      )

      expect(processed.snapshotKey).toBeTruthy()
      // And the bytes really went to S3, not just the announcement.
      expect(s3.keys).toContain(processed.snapshotKey as string)
    })
  })
}
