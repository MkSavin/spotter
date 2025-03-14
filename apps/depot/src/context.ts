import type { Consumer, Producer } from 'kafkajs'
import type { Client as MinioClient } from 'minio'
import type { Stenograph } from 'stenograph'
import type { CoreConfig } from './config'
import type { TempDirectoryController } from './fs/temp'

export type CoreContext = {
  directory: {
    temp: TempDirectoryController
  }
  config: CoreConfig
  logger: Stenograph
  minio: MinioClient
  consumer: Consumer
  producer: Producer
}
