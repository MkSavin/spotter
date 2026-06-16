import {
  type RedisConfig,
  env,
  requireConfig,
  resolveRedisConfig,
} from '@spotter/transport'
import information from '../package.json'
import { applicationLogger } from './log'

const cleanupStrategies = ['file-processed', 'process-exited'] as const

export type CoreConfig = {
  redis: RedisConfig

  s3: {
    host: string
    accessKey: string
    secretKey: string
    bucket: string
  }

  directory: {
    cleanupStrategy: (typeof cleanupStrategies)[number]
  }
}

export const resolveConfig = (): CoreConfig => {
  const result: CoreConfig = {
    redis: resolveRedisConfig({
      group: 'spotter-depot',
      clientId: information.name,
    }),
    s3: {
      host: env.string('S3_HOST', ''),
      accessKey: env.string('S3_ACCESS', ''),
      secretKey: env.string('S3_SECRET', ''),
      bucket: env.string('S3_BUCKET', 'spotter'),
    },
    directory: {
      cleanupStrategy: env.enum(
        'DIRECTORY_CLEANUP',
        cleanupStrategies,
        'file-processed',
      ),
    },
  }

  requireConfig({
    REDIS_URL: result.redis.url,
    S3_HOST: result.s3.host,
    S3_ACCESS: result.s3.accessKey,
    S3_SECRET: result.s3.secretKey,
  })

  applicationLogger.verbose('Using core configuration:', result)

  return result
}
