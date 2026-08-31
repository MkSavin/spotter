import type {
  CatalogCache,
  RedisConnection,
  StreamProducer,
} from '@spotter/transport'
import type { S3Client } from 'bun'
import type { Stenograph } from 'stenograph'
import type { Config } from './config'
import type { ServerDatabase } from './db/client'

export type ServerContext = {
  config: Config
  logger: Stenograph
  db: ServerDatabase
  catalog: CatalogCache
  s3: S3Client
  subscriber: RedisConnection
  producer: StreamProducer
}
