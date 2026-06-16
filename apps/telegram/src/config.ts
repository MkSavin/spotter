import { type RedisConfig, env, resolveRedisConfig } from '@spotter/transport'
import information from '../package.json'
import { applicationLogger } from './log'

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
  source: string
  presignExpiry: number
}

export const resolveConfig = (): Config => {
  const config: Config = {
    timezone: env.string('TZ', 'Europe/Moscow'),
    redis: resolveRedisConfig({
      group: 'spotter-telegram',
      clientId: information.name,
    }),
    telegram: {
      token: env.string('TELEGRAM_TOKEN', ''),
    },
    database: {
      path: env.string('DATABASE_PATH', './data/telegram.sqlite'),
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
