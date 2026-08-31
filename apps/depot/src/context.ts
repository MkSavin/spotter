import type { RedisConnection, StreamProducer } from '@spotter/transport'
import type { S3Client } from 'bun'
import type { Stenograph } from 'stenograph'
import type { CoreConfig } from './config'
import type { TempDirectoryController } from './fs/temp'

export type CoreContext = {
  directory: {
    temp: TempDirectoryController
  }
  config: CoreConfig
  logger: Stenograph
  s3: S3Client
  subscriber: RedisConnection
  producer: StreamProducer
}
