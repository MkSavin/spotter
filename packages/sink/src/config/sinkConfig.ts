import type { RedisConfig } from '@spotter/transport'

/**
 * S3 connection used to stage raw NVR media for depot to transcode. Optional in
 * the base config: ingest-only adapters (no MediaProvider) don't need it.
 */
export type SinkS3Config = {
  host: string
  accessKey: string
  secretKey: string
  bucket: string
  /** Key prefix under which raw (untranscoded) media is staged. */
  stagingPrefix: string
}

/**
 * Base configuration every sink adapter shares. Concrete adapters extend this
 * with their own source-specific block (e.g. `source.frigate.broker`).
 */
export type SinkConfig = {
  redis: RedisConfig
  s3?: SinkS3Config
}
