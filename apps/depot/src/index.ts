import process from 'node:process'
import {
  connectRedis,
  mediaStreams,
  RedisRegulator,
  StreamProducer,
  startHeartbeat,
} from '@spotter/transport'
import { RedisClient, S3Client } from 'bun'
import information from '../package.json'
import { resolveConfig } from './config'
import type { CoreContext } from './context'
import { cameraStagedController } from './controllers/cameraStagedController'
import { mediaStagedController } from './controllers/mediaStagedController'
import { temp } from './fs/temp'
import { applicationLogger } from './log'

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
  const subscriber = new RedisClient(config.redis.url)
  const producer = new StreamProducer(
    new RedisClient(config.redis.url),
    config.redis.maxLen,
  )

  const tempDir = await temp('spotter-depot-media-')

  let transport: Awaited<
    ReturnType<RedisRegulator<CoreContext>['run']>
  > | null = null

  let stopHeartbeat: (() => void) | null = null

  const shutdown = async (signal: NodeJS.Signals) => {
    applicationLogger.info(`Shutting down due to ${signal}...`)
    stopHeartbeat?.()
    await transport?.stop()
    subscriber.close()
    producer.disconnect()
    await tempDir.remove()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  await producer.connect()
  await connectRedis(subscriber, { url: config.redis.url })

  stopHeartbeat = startHeartbeat(producer, {
    service: 'depot',
    version: information.version,
  })

  transport = await new RedisRegulator<CoreContext>()
    .message(mediaStreams.mediaStaged, mediaStagedController)
    .message(mediaStreams.cameraStaged, cameraStagedController)
    .run(
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
