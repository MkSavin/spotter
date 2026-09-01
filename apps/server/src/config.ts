import {
  env,
  type RedisConfig,
  redactConfig,
  requireConfig,
  resolveRedisConfig,
} from '@spotter/transport'
import information from '../package.json'
import type { DeliveryPolicy } from './delivery/shouldDeliver'
import { applicationLogger } from './log'

export type S3Config = {
  host: string
  accessKey: string
  secretKey: string
  bucket: string
}

export type Config = {
  redis: RedisConfig
  database: {
    path: string
  }
  s3: S3Config
  /** Default source id for catalog bootstrapping and camera commands. */
  source: string
  retention: {
    /** How long persisted events are kept before retention drops them. */
    eventDays: number
  }
  delivery: {
    /** `all` — every event; `alerts` — only what the NVR flagged as an alert. */
    policy: DeliveryPolicy
  }
  auth: {
    /** How long a minted access code stays redeemable. */
    codeTtlMs: number
  }
}

export const resolveConfig = (): Config => {
  const config: Config = {
    redis: resolveRedisConfig({
      group: 'spotter-server',
      clientId: information.name,
    }),
    database: {
      path: env.string('DATABASE_PATH', './data/server.sqlite'),
    },
    s3: {
      host: env.string('S3_HOST', ''),
      accessKey: env.string('S3_ACCESS', ''),
      secretKey: env.string('S3_SECRET', ''),
      bucket: env.string('S3_BUCKET', 'spotter'),
    },
    source: env.string('SOURCE_ID', 'frigate'),
    retention: {
      eventDays: env.number('EVENT_RETENTION_DAYS', 30),
    },
    delivery: {
      policy: env.enum('DELIVERY_POLICY', ['all', 'alerts'] as const, 'all'),
    },
    auth: {
      codeTtlMs: env.number('ACCESS_CODE_TTL_HOURS', 24) * 60 * 60 * 1000,
    },
  }

  requireConfig({
    REDIS_URL: config.redis.url,
    S3_HOST: config.s3.host,
    S3_ACCESS: config.s3.accessKey,
    S3_SECRET: config.s3.secretKey,
  })

  applicationLogger.verbose('Using core configuration:', redactConfig(config))

  return config
}
