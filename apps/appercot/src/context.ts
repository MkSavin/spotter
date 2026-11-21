import type { BotApi } from '@appercot/chat'
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
import type { AppercotDatabase } from './db/client'

export type Context = {
  api: Pick<
    BotApi,
    | 'sendMessage'
    | 'editMessage'
    | 'answerCallback'
    | 'setChatRoles'
    | 'uploadFile'
  >
  commandBus: Pick<CommandBus, 'send'>
  producer: StreamProducer
  subscriber: RedisConnection
  db: AppercotDatabase
  config: Config
  catalog: CatalogCache
  heartbeats: HeartbeatRegistry
  logger: Stenograph
  s3: S3Client
  presign: (key: string) => string
}
