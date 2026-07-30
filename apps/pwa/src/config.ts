import {
  type RedisConfig,
  env,
  redactConfig,
  requireConfig,
  resolveRedisConfig,
} from '@spotter/transport'
import information from '../package.json'
import { applicationLogger } from './log'

export type S3Config = {
  host: string
  accessKey: string
  secretKey: string
  bucket: string
}

export type VapidConfig = {
  /** `mailto:` or URL identifying the sender, required by the VAPID spec. */
  subject: string
  publicKey: string
  privateKey: string
}

export type Config = {
  timezone: string
  redis: RedisConfig
  vapid: VapidConfig
  database: {
    path: string
  }
  s3: S3Config
  source: string
  presignExpiry: number
  /** HTTP port for the web app + REST API. */
  port: number
  /** Canonical base URL (deep links, notification click target). */
  publicUrl: string
  /** Window that collapses a storm of events into one push notification. */
  coalesceMs: number
  /**
   * One-time device authorization codes (v1: local check). Empty disables the
   * gate — any subscribed device receives pushes. See AGENTS.md.
   */
  accessCodes: string[]
}

export const resolveConfig = (): Config => {
  const config: Config = {
    timezone: env.string('TZ', 'Europe/Moscow'),
    redis: resolveRedisConfig({
      group: 'spotter-pwa',
      clientId: information.name,
    }),
    vapid: {
      subject: env.string('VAPID_SUBJECT', ''),
      publicKey: env.string('VAPID_PUBLIC_KEY', ''),
      privateKey: env.string('VAPID_PRIVATE_KEY', ''),
    },
    database: {
      path: env.string('DATABASE_PATH', './data/pwa.sqlite'),
    },
    s3: {
      host: env.string('S3_HOST', ''),
      accessKey: env.string('S3_ACCESS', ''),
      secretKey: env.string('S3_SECRET', ''),
      bucket: env.string('S3_BUCKET', 'spotter'),
    },
    source: env.string('SOURCE_ID', 'frigate'),
    presignExpiry: env.number('S3_PRESIGN_EXPIRY', 3600),
    port: env.number('PORT', 3000),
    publicUrl: env.string('PUBLIC_URL', ''),
    coalesceMs: env.number('PWA_COALESCE_MS', 45000),
    accessCodes: env.stringArray('PWA_ACCESS_CODES', []),
  }

  requireConfig({
    REDIS_URL: config.redis.url,
    VAPID_SUBJECT: config.vapid.subject,
    VAPID_PUBLIC_KEY: config.vapid.publicKey,
    VAPID_PRIVATE_KEY: config.vapid.privateKey,
    S3_HOST: config.s3.host,
    S3_ACCESS: config.s3.accessKey,
    S3_SECRET: config.s3.secretKey,
  })

  applicationLogger.verbose('Using core configuration:', redactConfig(config))

  return config
}
