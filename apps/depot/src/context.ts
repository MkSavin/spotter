import type { Consumer, Producer } from 'kafkajs'
import type { Stenograph } from 'stenograph'
import type { CoreConfig } from './config'
import type { DirectoryController } from './fs/dir'
import type { TempDirectoryController } from './fs/temp'

export type CoreContext = {
  directory: {
    temp: TempDirectoryController
    destination: DirectoryController
  }
  config: CoreConfig
  logger: Stenograph
  consumer: Consumer
  producer: Producer
}
