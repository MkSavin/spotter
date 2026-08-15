import process from 'node:process'
import {
  connectRedis,
  RedisRegulator,
  StreamProducer,
} from '@spotter/transport'
import { RedisClient } from 'bun'
import type { Stenograph } from 'stenograph'
import information from '../package.json'
import { resolveConfig } from './config'
import { forward } from './forward'
import { applicationLogger } from './log'
import { downStreams, UP_STREAMS } from './streams'

type BridgeContext = {
  subscriber: RedisClient
  producer: StreamProducer
  logger: Stenograph
}

const run = async (): Promise<void> => {
  applicationLogger.info(
    `Initializing ${information.name} v${information.version}...`,
  )

  const config = resolveConfig()

  // One blocking subscriber + one producer (XADD/admin) per Redis side. The
  // forwarder is the only component touching both instances.
  const localSubscriber = new RedisClient(config.localUrl)
  const localProducer = new StreamProducer(
    new RedisClient(config.localUrl),
    config.maxLen,
  )
  const remoteSubscriber = new RedisClient(config.remoteUrl)
  const remoteProducer = new StreamProducer(
    new RedisClient(config.remoteUrl),
    config.maxLen,
  )

  await Promise.all([
    connectRedis(localSubscriber, { url: config.localUrl }),
    connectRedis(remoteSubscriber, { url: config.remoteUrl }),
    localProducer.connect(),
    remoteProducer.connect(),
  ])

  const baseOptions = {
    consumer: config.consumer,
    blockMs: config.blockMs,
    count: config.count,
    reclaimMinIdleMs: config.reclaimMinIdleMs,
    reaperIntervalMs: config.reaperIntervalMs,
    maxDeliveries: config.maxDeliveries,
  }

  // UP: read on local, mirror to remote. XACK/admin run on local (source).
  const up = new RedisRegulator<BridgeContext>()
  for (const stream of UP_STREAMS) {
    up.message(stream, forward(remoteProducer, config.maxLen))
  }

  // DOWN: read on remote, mirror to local. XACK/admin run on remote (source).
  const down = new RedisRegulator<BridgeContext>()
  for (const stream of downStreams(config.sources)) {
    down.message(stream, forward(localProducer, config.maxLen))
  }

  const upHandle = await up.run(
    {
      subscriber: localSubscriber,
      producer: localProducer,
      logger: applicationLogger,
    },
    { ...baseOptions, group: config.group.up },
  )

  const downHandle = await down.run(
    {
      subscriber: remoteSubscriber,
      producer: remoteProducer,
      logger: applicationLogger,
    },
    { ...baseOptions, group: config.group.down },
  )

  const shutdown = async (signal: NodeJS.Signals) => {
    applicationLogger.info(`Shutting down due to ${signal}...`)
    await upHandle.stop()
    await downHandle.stop()
    localSubscriber.close()
    remoteSubscriber.close()
    localProducer.disconnect()
    remoteProducer.disconnect()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  applicationLogger.info('Application successfully started up')
}

run().catch((error) => {
  applicationLogger.error(error)
  process.exit(1)
})
