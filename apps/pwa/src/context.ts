import type { CatalogCache, StreamProducer } from '@spotter/transport'
import type { RedisClient, S3Client } from 'bun'
import type { Stenograph } from 'stenograph'
import type { Config } from './config'
import type { PwaDatabase } from './db/client'
import type { PushCoalescer } from './push/Coalescer'
import type { PushGateway } from './push/PushGateway'

/** Long-lived dependencies assembled once at startup. */
export type CoreContext = {
  config: Config
  logger: Stenograph
  db: PwaDatabase
  catalog: CatalogCache
  s3: S3Client
  push: PushGateway
  coalescer: PushCoalescer
  producer: StreamProducer
  subscriber: RedisClient
}

/** Context handed to every stream controller (same shape as CoreContext). */
export type TransportContext = CoreContext
