import type { CatalogCache, StreamProducer } from '@spotter/transport'
import type { RedisClient, S3Client } from 'bun'
import type { Stenograph } from 'stenograph'
import type { Config } from './config'
import type { EmailDatabase } from './db/client'
import type { SmtpGateway } from './mail/SmtpGateway'

/** Long-lived dependencies assembled once at startup. */
export type CoreContext = {
  config: Config
  logger: Stenograph
  db: EmailDatabase
  catalog: CatalogCache
  s3: S3Client
  mailer: SmtpGateway
  producer: StreamProducer
  subscriber: RedisClient
}

/**
 * Context handed to every controller. Adds the two fields `RedisRegulator`
 * requires on its `BaseContext` (already present on `CoreContext`) — kept as a
 * distinct alias so controllers document what they consume.
 */
export type TransportContext = CoreContext
