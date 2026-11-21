import process from 'node:process'
import { BotApi } from '@appercot/chat'
import {
  CatalogCache,
  CommandBus,
  guardRejections,
  HeartbeatRegistry,
  RedisConnection,
  type RegulatorHandle,
  readQueueDepths,
  StreamProducer,
  startHeartbeat,
  startLiveness,
  startRetention,
} from '@spotter/transport'
import { S3Client } from 'bun'
import { defaultLogger } from 'stenograph'
import information from '../package.json'
import { createRouter } from './bot'
import { commandMenu } from './commands'
import { resolveConfig } from './config'
import { AppercotConnection } from './connection'
import type { Context } from './context'
import { createDatabase } from './db/client'
import { catalogStore, prune } from './db/repository'
import { startTransport } from './transport'

const logger = defaultLogger.sub('appercot')
guardRejections(logger)

const main = async () => {
  const config = resolveConfig()
  const db = createDatabase(config.databasePath)
  const subscriber = new RedisConnection(config.redis.url)
  const replySubscriber = new RedisConnection(config.redis.url)
  const producer = new StreamProducer(
    new RedisConnection(config.redis.url),
    config.redis.maxLen,
  )
  await Promise.all([
    subscriber.connect(),
    replySubscriber.connect(),
    producer.connect(),
  ])

  const catalog = new CatalogCache(logger.sub('catalog'), catalogStore(db))
  const heartbeats = new HeartbeatRegistry(logger.sub('heartbeat'))
  const commandBus = new CommandBus(
    producer,
    replySubscriber,
    logger.sub('commands'),
  )
  await catalog.bootstrap(config.source, producer)
  commandBus.start()

  const s3Options = {
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
    bucket: config.s3.bucket,
  }
  const s3 = new S3Client({ ...s3Options, endpoint: config.s3.host })
  const publicS3 = new S3Client({ ...s3Options, endpoint: config.s3PublicUrl })
  let transport: RegulatorHandle | undefined

  const connection = new AppercotConnection({
    url: config.url,
    token: config.token,
    ackOnError: false,
    configuresOnHello: () => true,
    onEvent: async (event) => {
      try {
        await router.receive(event)
      } catch (error) {
        logger.warn(`Appercot ${event.type} handling failed: ${error}`)
        throw error
      }
    },
    onHello: async () => {
      await api.setRoles(commandMenu)
      transport ??= await startTransport(context)
    },
  })
  const api = new BotApi(connection)
  const context: Context = {
    api,
    commandBus,
    producer,
    subscriber,
    db,
    config,
    catalog,
    heartbeats,
    logger,
    s3,
    presign: (key) =>
      publicS3.presign(key, { expiresIn: config.presignExpiry }),
  }
  const router = createRouter(context)
  const startTimeout = setTimeout(() => connection.stop(), 45_000)
  try {
    await connection.start()
  } finally {
    clearTimeout(startTimeout)
  }
  logger.info('Appercot bot connected')

  const stopLiveness = startLiveness({
    check: async () => {
      await api.getMe()
      await producer.send('PING', [])
      return true
    },
  })
  const stopHeartbeat = startHeartbeat(producer, {
    service: 'appercot',
    version: information.version,
    queues: async () =>
      transport
        ? readQueueDepths(producer, transport.streams, config.redis.group)
        : [],
  })
  const stopRetention = startRetention({
    label: 'Appercot state',
    retentionMs: config.retentionMs,
    prune: (cutoff) => {
      router.sweep()
      return prune(db, cutoff)
    },
    logger,
  })

  let stopping = false
  const shutdown = async () => {
    if (stopping) return
    stopping = true
    stopLiveness()
    stopHeartbeat()
    stopRetention()
    await Promise.all([transport?.stop(), router.drain()])
    connection.stop()
    commandBus.stop()
    subscriber.close()
    replySubscriber.close()
    producer.disconnect()
    db.$client.close()
    process.exit(0)
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

main().catch((error) => {
  logger.error(error)
  process.exit(1)
})
