import type { S3Client } from 'bun'
import type { Consumer, Producer } from 'kafkajs'
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
  consumer: Consumer
  producer: Producer
}
