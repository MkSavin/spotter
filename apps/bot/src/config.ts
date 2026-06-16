import { type RedisConfig, env, resolveRedisConfig } from '@spotter/transport'
import information from '../../../package.json'
import { applicationLogger } from './log'

/** S3 access for presigning processed media handed to Telegram. */
export type S3Config = {
  host: string
  accessKey: string
  secretKey: string
  bucket: string
}

export type Config = {
  timezone: string
  redis: RedisConfig
  telegram: {
    token: string
  }
  database: {
    path: string
  }
  s3: S3Config
  /**
   * Default NVR source for camera commands and `code → label` rendering. Event
   * media is routed by each event's own `source`; this is the fallback for
   * frontend-initiated actions that aren't tied to an event.
   */
  source: string
  /** Presigned URL lifetime (seconds) for processed media handed to Telegram. */
  presignExpiry: number
}

export const resolveConfig = (): Config => {
  const config: Config = {
    timezone: env.string('TZ', 'Europe/Moscow'),
    redis: resolveRedisConfig({
      group: 'spotter-bot',
      clientId: information.name,
    }),
    telegram: {
      token: env.string('TELEGRAM_TOKEN', ''),
    },
    database: {
      path: env.string('DATABASE_PATH', './data/bot.sqlite'),
    },
    s3: {
      host: env.string('S3_HOST', ''),
      accessKey: env.string('S3_ACCESS', ''),
      secretKey: env.string('S3_SECRET', ''),
      bucket: env.string('S3_BUCKET', 'spotter'),
    },
    source: env.string('SOURCE_ID', 'frigate'),
    presignExpiry: env.number('S3_PRESIGN_EXPIRY', 3600),
  }

  if (!config.telegram.token) {
    throw new Error('Bad configuration. No telegram token found.')
  }
  if (!config.redis.url) {
    throw new Error('Bad configuration. No redis url found.')
  }
  if (!config.s3.host) {
    throw new Error('Bad configuration. No s3 host found for media presigning.')
  }

  applicationLogger.verbose('Using core configuration:', config)

  return config
}
