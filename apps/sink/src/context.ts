import type { StreamProducer } from '@spotter/transport'
import type { RedisClient } from 'bun'
import type { Stenograph } from 'stenograph'
import type { CoreConfig } from './config'

export type CoreContext = {
  config: CoreConfig
  logger: Stenograph
  producer: StreamProducer
  subscriber: RedisClient
}
