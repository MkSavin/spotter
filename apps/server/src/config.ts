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
  redis: RedisConfig
  database: {
    path: string
  }
  s3: S3Config
  /** Default source id for catalog bootstrapping and camera commands. */
  source: string
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
  }

  if (!config.redis.url) {
    throw new Error('Bad configuration. No redis url found.')
  }
  if (!config.s3.host) {
    throw new Error('Bad configuration. No s3 host found.')
  }

  applicationLogger.verbose('Using core configuration:', config)

  return config
}
