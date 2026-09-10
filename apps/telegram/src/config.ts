import {
  env,
  type RedisConfig,
  redactConfig,
  requireConfig,
  resolveRedisConfig,
  resolveS3Config,
  type S3Config,
} from '@spotter/transport'
import information from '../package.json'
import { applicationLogger } from './log'

export type Config = {
  timezone: string
  redis: RedisConfig
  telegram: {
    token: string
    /**
     * Empty means Telegram's own servers. Also what a self-hosted Bot API and
     * Telegram's test infrastructure need.
     */
    apiRoot: string
    /**
     * Telegram's own test infrastructure — separate accounts, separate
     * BotFather, nothing shared with real chats. Off unless asked for.
     */
    testEnvironment: boolean
  }
  database: {
    path: string
  }
  s3: S3Config
  source: string
  presignExpiry: number
  retention: {
    /** How long an event's message links are kept before retention drops them. */
    messageDays: number
  }
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
      apiRoot: env.string('TELEGRAM_API_ROOT', ''),
      testEnvironment: env.boolean('TELEGRAM_TEST_ENVIRONMENT', false),
    },
    database: {
      path: env.string('DATABASE_PATH', './data/telegram.sqlite'),
    },
    s3: resolveS3Config(),
    source: env.string('SOURCE_ID', 'frigate'),
    presignExpiry: env.number('S3_PRESIGN_EXPIRY', 3600),
    retention: {
      messageDays: env.number('MESSAGE_RETENTION_DAYS', 30),
    },
  }

  requireConfig({
    TELEGRAM_TOKEN: config.telegram.token,
    REDIS_URL: config.redis.url,
    S3_HOST: config.s3.host,
    S3_ACCESS: config.s3.accessKey,
    S3_SECRET: config.s3.secretKey,
  })

  applicationLogger.verbose('Using core configuration:', redactConfig(config))

  return config
}
