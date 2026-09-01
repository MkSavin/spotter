import type {
  CatalogCache,
  CommandBus,
  HeartbeatRegistry,
  RedisConnection,
  StreamProducer,
} from '@spotter/transport'
import type { S3Client } from 'bun'
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
  subscriber: RedisConnection
  /** Domain-mutating requests to server, awaiting a correlated reply. */
  commandBus: CommandBus
  /** Latest heartbeat per service, for the status screen. */
  heartbeats: HeartbeatRegistry
}

/** Context handed to every stream controller (same shape as CoreContext). */
export type TransportContext = CoreContext
