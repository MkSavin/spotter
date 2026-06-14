import { type RedisConfig, env, resolveRedisConfig } from '@spotter/transport'
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

  if (!result.redis.url) {
    throw new Error('Bad configuration. No redis url found.')
  }

  if (!result.s3.host) {
    throw new Error('Bad configuration. No s3 host found.')
  }

  applicationLogger.verbose('Using core configuration:', result)

  return result
}
