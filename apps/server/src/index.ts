import process from 'node:process'
import {
  CatalogCache,
  probeRedisVersion,
  RedisConnection,
  type RegulatorHandle,
  StreamProducer,
  startHeartbeat,
  startLiveness,
} from '@spotter/transport'
import { S3Client } from 'bun'
import information from '../package.json'
import { resolveConfig } from './config'
import type { ServerContext } from './context'
import { createDatabase, type ServerDatabase } from './db/client'
import { applicationLogger } from './log'
import { serverTransport } from './transport/serverTransport'

let db: ServerDatabase | undefined

const run = async (): Promise<void> => {
  applicationLogger.info('Initializing spotter-server...')

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

  const subscriber = new RedisConnection(config.redis.url)
  const producer = new StreamProducer(
    new RedisConnection(config.redis.url),
    config.redis.maxLen,
  )

  await producer.connect()
  await subscriber.connect()

  const stopHeartbeat = startHeartbeat(producer, {
    service: 'server',
    version: information.version,
    details: () => probeRedisVersion(producer),
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

  const context: ServerContext = {
    config,
    logger: applicationLogger,
    db: database,
    catalog,
    s3,
    producer,
    subscriber,
  }

  let transport: RegulatorHandle | null = null

  const shutdown = async (signal: NodeJS.Signals) => {
    applicationLogger.info(`Shutting down due to ${signal}...`)
    stopHeartbeat()
    stopLiveness()
    await transport?.stop()
    subscriber.close()
    producer.disconnect()
    database.$client.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  transport = await serverTransport(context)

  applicationLogger.info('spotter-server is running')
}

run().catch((error) => {
  applicationLogger.error(error)
  db?.$client.close()
  process.exit(1)
})
