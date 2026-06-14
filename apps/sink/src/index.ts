import process from 'node:process'
import { RedisRegulator, StreamProducer } from '@spotter/transport'
import { RedisClient } from 'bun'
import information from '../package.json'
import { resolveConfig } from './config'
import type { CoreContext } from './context'
import { publishEvent } from './helpers/publishEvent'
import { applicationLogger } from './log'
import type { SourceHandle } from './source/Source'
import { constructSource } from './source/constructSource'
import { eventTestController } from './stream/controllers/eventTestController'

const run = async (): Promise<void> => {
  applicationLogger.info(
    `Initializing ${information.name} v${information.version}...`,
  )

  const config = resolveConfig()

  // Dedicated blocking connection for XREADGROUP; the producer connection stays
  // free for XADD (ingested events + test seeds) and the regulator's acks.
  const subscriber = new RedisClient(config.redis.url)
  const producer = new StreamProducer(
    new RedisClient(config.redis.url),
    config.redis.maxLen,
  )

  await producer.connect()
  await subscriber.connect()

  // Pluggable NVR ingestion: one source per sink instance. The source emits
  // canonical SpotterEvents; we publish them onto the stream.
  const source = constructSource(config.source.type, config, applicationLogger)

  let sourceHandle: SourceHandle | null = null
  let transport: Awaited<
    ReturnType<RedisRegulator<CoreContext>['run']>
  > | null = null

  const shutdown = async (signal: NodeJS.Signals) => {
    applicationLogger.info(`Shutting down due to ${signal}...`)
    await transport?.stop()
    await sourceHandle?.stop()
    subscriber.close()
    producer.disconnect()
    process.exit(1)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  const context: CoreContext = {
    producer,
    subscriber,
    config,
    logger: applicationLogger,
  }

  sourceHandle = await source.run(async (event) => {
    await publishEvent(event, producer)
  })

  transport = await new RedisRegulator<CoreContext>()
    .message('spotter.event.test_seed', eventTestController)
    .run(context, {
      group: config.redis.group,
      consumer: config.redis.consumer,
      blockMs: config.redis.blockMs,
      count: config.redis.count,
      reclaimMinIdleMs: config.redis.reclaimMinIdleMs,
      reaperIntervalMs: config.redis.reaperIntervalMs,
    })

  applicationLogger.info('Application successfully started up')
}

run().catch((error) => {
  applicationLogger.error(error)
  process.exit(1)
})
