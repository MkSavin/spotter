import process from 'node:process'
import {
  mediaStreams,
  RedisConnection,
  RedisRegulator,
  StreamProducer,
  startHeartbeat,
  startLiveness,
} from '@spotter/transport'
import { S3Client } from 'bun'
import information from '../package.json'
import { resolveConfig } from './config'
import type { CoreContext } from './context'
import { cameraStagedController } from './controllers/cameraStagedController'
import { mediaStagedController } from './controllers/mediaStagedController'
import { sweepStale, temp } from './fs/temp'
import { applicationLogger } from './log'
import { probeDetails } from './probeDetails'

const run = async (): Promise<void> => {
  applicationLogger.info(
    `Initializing ${information.name} v${information.version}...`,
  )

  const config = resolveConfig()

  const s3 = new S3Client({
    endpoint: config.s3.host,
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
    bucket: config.s3.bucket,
  })

  // Dedicated blocking connection for XREADGROUP; the producer connection stays
  // free for the regulator's acks/reclaims and back-message publishing.
  const subscriber = new RedisConnection(config.redis.url)
  const producer = new StreamProducer(
    new RedisConnection(config.redis.url),
    config.redis.maxLen,
  )

  const TEMP_PREFIX = 'spotter-depot-media-'

  // Anything left by a killed predecessor; harmless if there is nothing.
  await sweepStale(TEMP_PREFIX)

  const tempDir = await temp(TEMP_PREFIX)

  let transport: Awaited<
    ReturnType<RedisRegulator<CoreContext>['run']>
  > | null = null

  let stopHeartbeat: (() => void) | null = null
  let stopLiveness: (() => void) | null = null

  const shutdown = async (signal: NodeJS.Signals) => {
    applicationLogger.info(`Shutting down due to ${signal}...`)
    stopHeartbeat?.()
    stopLiveness?.()
    await transport?.stop()
    subscriber.close()
    producer.disconnect()
    await tempDir.remove()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  await producer.connect()
  await subscriber.connect()

  stopHeartbeat = startHeartbeat(producer, {
    service: 'depot',
    version: information.version,
    details: () => probeDetails(config),
  })

  // Healthcheck signal: refreshed only while Redis actually answers, so a
  // wedged-but-running container fails its healthcheck and gets restarted.
  stopLiveness = startLiveness({
    check: async () => {
      await subscriber.send('PING', [])
      return true
    },
  })

  // Camera frames ride the snapshot lane: both are quick and user-facing.
  const regulator = new RedisRegulator<CoreContext>()

  if (config.lane !== 'clips') {
    regulator
      .message(mediaStreams.mediaStaged, mediaStagedController)
      .message(mediaStreams.cameraStaged, cameraStagedController)
  }

  if (config.lane !== 'snapshots') {
    regulator.message(mediaStreams.mediaStagedClip, mediaStagedController)
  }

  applicationLogger.info(
    `Consuming lane "${config.lane}": ${regulator.streams.join(', ')}`,
  )

  transport = await regulator.run(
    {
      directory: {
        temp: tempDir,
      },
      logger: applicationLogger,
      config,
      s3,
      subscriber,
      producer,
    },
    {
      group: config.redis.group,
      consumer: config.redis.consumer,
      blockMs: config.redis.blockMs,
      count: config.redis.count,
      reclaimMinIdleMs: config.redis.reclaimMinIdleMs,
      reaperIntervalMs: config.redis.reaperIntervalMs,
      maxDeliveries: config.redis.maxDeliveries,
    },
  )

  applicationLogger.info('Application successfully started up')
}

run().catch((error) => {
  applicationLogger.error(error)
  process.exit(1)
})
