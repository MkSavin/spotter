import type { StreamProducer } from '@spotter/transport'
import type { RedisClient, S3Client } from 'bun'
import type { Stenograph } from 'stenograph'
import type { SinkConfig } from '../config/sinkConfig'

/**
 * Base context the sink runtime threads into every stream controller. Adapter
 * apps parameterize it with their own config shape.
 */
export type SinkContext<TConfig extends SinkConfig = SinkConfig> = {
  config: TConfig
  logger: Stenograph
  producer: StreamProducer
  subscriber: RedisClient
  /** Routing id of this adapter instance — the `<source>` in stream/key names. */
  sourceId: string
  /** S3 client for staging raw media; `null` for ingest-only adapters. */
  s3: S3Client | null
}
