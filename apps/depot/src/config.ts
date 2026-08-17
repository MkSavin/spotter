import {
  env,
  type RedisConfig,
  redactConfig,
  requireConfig,
  resolveRedisConfig,
} from '@spotter/transport'
import information from '../package.json'
import { applicationLogger } from './log'

const cleanupStrategies = ['file-processed', 'process-exited'] as const
const accelerations = ['cpu', 'vaapi', 'videotoolbox', 'cuda'] as const
const codecs = ['h264', 'hevc'] as const
const qualities = ['best', 'good', 'normal', 'bad', 'awful'] as const

export type VideoConfig = {
  acceleration: (typeof accelerations)[number]
  codec: (typeof codecs)[number]
  quality: (typeof qualities)[number]
  device: number
  skipConversion: boolean
  /**
   * Hard cap on a single ffmpeg run. A stuck encode never releases the message,
   * and once it idles past REDIS_RECLAIM_MIN_IDLE_MS the reaper would re-dispatch
   * a duplicate transcode — so keep this comfortably below that idle threshold.
   */
  timeoutMs: number
}

export type ImageConfig = {
  quality: (typeof qualities)[number]
  skipConversion: boolean
}

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

  video: VideoConfig
  image: ImageConfig
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
    video: {
      acceleration: env.enum('VIDEO_ACCELERATION', accelerations, 'cpu'),
      codec: env.enum('VIDEO_CODEC', codecs, 'h264'),
      quality: env.enum('VIDEO_QUALITY', qualities, 'best'),
      device: env.number('VIDEO_DEVICE', 0),
      skipConversion: env.boolean('VIDEO_SKIP_CONVERSION', false),
      timeoutMs: env.number('VIDEO_TIMEOUT_MS', 120000),
    },
    image: {
      quality: env.enum('IMAGE_QUALITY', qualities, 'best'),
      skipConversion: env.boolean('IMAGE_SKIP_CONVERSION', false),
    },
  }

  requireConfig({
    REDIS_URL: result.redis.url,
    S3_HOST: result.s3.host,
    S3_ACCESS: result.s3.accessKey,
    S3_SECRET: result.s3.secretKey,
  })

  applicationLogger.verbose('Using core configuration:', redactConfig(result))

  return result
}
