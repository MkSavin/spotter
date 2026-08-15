import process from 'node:process'
import {
  connectRedis,
  type RegulatorHandle,
  StreamProducer,
} from '@spotter/transport'
import { RedisClient, S3Client } from 'bun'
import { CatalogCache } from './catalog/CatalogCache'
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
  const push = new PushGateway(config.vapid, applicationLogger.sub('push'))
  const coalescer = new PushCoalescer({
    db: database,
    push,
    coalesceMs: config.coalesceMs,
  })

  const subscriber = new RedisClient(config.redis.url)
  const producer = new StreamProducer(
    new RedisClient(config.redis.url),
    config.redis.maxLen,
  )

  await producer.connect()
  await connectRedis(subscriber, { url: config.redis.url })

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
  }

  const shutdown = async (signal: NodeJS.Signals) => {
    applicationLogger.info(`Shutting down due to ${signal}...`)
    context.coalescer.stop()
    await transport?.stop()
    server?.stop()
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
