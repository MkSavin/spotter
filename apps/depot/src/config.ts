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

const cleanupStrategies = ['file-processed', 'process-exited'] as const
const lanes = ['all', 'snapshots', 'clips'] as const
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
   * Hard cap on a single ffmpeg run. Unrelated to the reclaim window now that
   * transcoding runs outside the stream entry: this only kills a stuck encode.
   */
  timeoutMs: number
  /** How many clips one replica encodes at once. */
  concurrency: number
}

export type ImageConfig = {
  quality: (typeof qualities)[number]
  skipConversion: boolean
}

/**
 * Which staged streams this replica consumes.
 *
 * `snapshots` keeps a worker free for the fast, user-visible media while
 * `clips` grinds through long transcodes on another. `all` (the default) is the
 * single-node behaviour.
 */
export type Lane = (typeof lanes)[number]

export type CoreConfig = {
  redis: RedisConfig

  /** Staged streams this replica subscribes to. */
  lane: Lane
  /** Where accepted-but-unfinished transcodes are remembered across restarts. */
  transcodeStatePath: string

  s3: S3Config

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
    lane: env.enum('DEPOT_LANE', lanes, 'all'),
    transcodeStatePath: env.string(
      'TRANSCODE_STATE_PATH',
      '/data/transcode-jobs.json',
    ),
    s3: resolveS3Config(),
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
      timeoutMs: env.number('VIDEO_TIMEOUT_MS', 14_400_000),
      concurrency: env.number('VIDEO_CONCURRENCY', 1),
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
