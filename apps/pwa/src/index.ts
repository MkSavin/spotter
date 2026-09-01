import process from 'node:process'
import {
  CatalogCache,
  CommandBus,
  HeartbeatRegistry,
  RedisConnection,
  type RegulatorHandle,
  StreamProducer,
  startHeartbeat,
  startLiveness,
} from '@spotter/transport'
import { S3Client } from 'bun'
import information from '../package.json'
import { resolveConfig } from './config'
import type { CoreContext } from './context'
import { createDatabase, type PwaDatabase } from './db/client'
import { applicationLogger } from './log'
import { PushCoalescer } from './push/Coalescer'
import { PushGateway } from './push/PushGateway'
import { createServer } from './server/createServer'
import { pwaTransport } from './transport/pwaTransport'

let db: PwaDatabase | undefined

const main = async (): Promise<void> => {
  applicationLogger.info('Initializing spotter-pwa...')

  const config = resolveConfig()

  const database = createDatabase(config.database.path)
  db = database

  const s3 = new S3Client({
    endpoint: config.s3.host,
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
    bucket: config.s3.bucket,
  })

  const catalog = new CatalogCache(applicationLogger.sub('catalog'))
  const heartbeats = new HeartbeatRegistry(applicationLogger.sub('status'))
  const push = new PushGateway(config.vapid, applicationLogger.sub('push'))
  const coalescer = new PushCoalescer({
    db: database,
    push,
    coalesceMs: config.coalesceMs,
  })

  const subscriber = new RedisConnection(config.redis.url)
  const producer = new StreamProducer(
    new RedisConnection(config.redis.url),
    config.redis.maxLen,
  )

  // Its own connection: the reply poller blocks on XREAD, and sharing the
  // regulator's subscriber would stall event delivery behind every command.
  const commandSubscriber = new RedisConnection(config.redis.url)

  await producer.connect()
  await subscriber.connect()
  await commandSubscriber.connect()

  const commandBus = new CommandBus(
    producer,
    commandSubscriber,
    applicationLogger.sub('command'),
  )
  commandBus.start()

  const stopHeartbeat = startHeartbeat(producer, {
    service: 'pwa',
    version: information.version,
  })

  // Healthcheck signal: refreshed only while Redis actually answers, so a
  // wedged-but-running container fails its healthcheck and gets restarted.
  const stopLiveness = startLiveness({
    check: async () => {
      await subscriber.send('PING', [])
      return true
    },
  })

  await catalog.bootstrap(config.source, producer)

  let transport: RegulatorHandle | null = null
  let server: ReturnType<typeof createServer> | null = null

  const context: CoreContext = {
    config,
    logger: applicationLogger,
    db: database,
    catalog,
    s3,
    push,
    coalescer,
    producer,
    subscriber,
    commandBus,
    heartbeats,
  }

  const shutdown = async (signal: NodeJS.Signals) => {
    applicationLogger.info(`Shutting down due to ${signal}...`)
    stopHeartbeat()
    stopLiveness()
    context.coalescer.stop()
    commandBus.stop()
    await transport?.stop()
    server?.stop()
    commandSubscriber.close()
    subscriber.close()
    producer.disconnect()
    database.$client.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  server = createServer(context)
  transport = await pwaTransport(context)

  applicationLogger.info(`spotter-pwa is up on port ${config.port}`)
}

main().catch((error) => {
  applicationLogger.error(error)
  db?.$client.close()
  process.exit(1)
})
