import process from 'node:process'
import {
  CatalogCache,
  DEDUP_RETENTION_MS,
  RedisConnection,
  type RegulatorHandle,
  StreamProducer,
  startHeartbeat,
  startLiveness,
  startRetention,
} from '@spotter/transport'
import { S3Client } from 'bun'
import information from '../package.json'
import { resolveConfig } from './config'
import type { CoreContext } from './context'
import { createDatabase, type EmailDatabase } from './db/client'
import { notifiedEventsRepo } from './db/repository'
import { applicationLogger } from './log'
import { SmtpGateway } from './mail/SmtpGateway'
import { emailTransport } from './transport/emailTransport'

let db: EmailDatabase | undefined

const main = async (): Promise<void> => {
  applicationLogger.info('Initializing spotter-email...')

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
  const mailer = new SmtpGateway(config.smtp, applicationLogger.sub('smtp'))

  const subscriber = new RedisConnection(config.redis.url)
  const producer = new StreamProducer(
    new RedisConnection(config.redis.url),
    config.redis.maxLen,
  )

  await producer.connect()
  await subscriber.connect()

  const stopHeartbeat = startHeartbeat(producer, {
    service: 'email',
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

  const stopRetention = startRetention({
    label: 'dedup ledger',
    retentionMs: DEDUP_RETENTION_MS,
    prune: (cutoff) => notifiedEventsRepo.prune(database, cutoff),
    logger: applicationLogger,
  })

  // Fail fast if SMTP creds are wrong — better at boot than on the first event.
  await mailer.verify()

  await catalog.bootstrap(config.source, producer)

  let transport: RegulatorHandle | null = null

  const context: CoreContext = {
    config,
    logger: applicationLogger,
    db: database,
    catalog,
    s3,
    mailer,
    producer,
    subscriber,
  }

  const shutdown = async (signal: NodeJS.Signals) => {
    applicationLogger.info(`Shutting down due to ${signal}...`)
    stopHeartbeat()
    stopLiveness()
    stopRetention()
    await transport?.stop()
    subscriber.close()
    producer.disconnect()
    database.$client.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  transport = await emailTransport(context)

  applicationLogger.info(
    `spotter-email is up (mode=${config.mode}, ${config.recipients.length} recipients)`,
  )
}

main().catch((error) => {
  applicationLogger.error(error)
  db?.$client.close()
  process.exit(1)
})
