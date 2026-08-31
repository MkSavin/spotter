import type { SinkConfig } from '@spotter/sink'
import {
  type CatalogEntry,
  env,
  redactConfig,
  requireConfig,
  resolveRedisConfig,
} from '@spotter/transport'
import information from '../package.json'
import { applicationLogger } from './log'
import type { SourceCode } from './source/constructSource'

/** Frigate media-access credentials — live only in this adapter. */
export type FrigateMediaConfig = {
  remoteUrl: string
  authSecret: string
  authUser: string
}

/** Display labels for the catalog, keyed by Frigate code. */
export type FrigateLabels = {
  cameras: Record<string, string>
  objects: Record<string, string>
}

export type CoreConfig = SinkConfig & {
  /** Routing id of this instance — the `<source>` in stream/key names. */
  sourceId: string

  source: {
    type: SourceCode
    frigate: {
      broker: string
    }
  }

  /** Frigate REST/media credentials (clip/snapshot/frame + catalog). */
  frigate: FrigateMediaConfig

  /**
   * Where in-flight timelapse exports are recorded. An export outlives the
   * request that started it, so this has to sit on a volume to be of any use.
   */
  timelapseStatePath: string

  labels: FrigateLabels
}

const defaultLabels: FrigateLabels = {
  objects: {
    person: '🧍 человек',
    car: '🚗 машина',
    dog: '🐶 собака',
    cat: '😺 кот',
    horse: '🐎 лошадь',
    bear: '🐻 медведь',
  },
  cameras: {
    front: '🎥 передняя',
    side: '🎥 боковая',
  },
}

export const toCatalogEntries = (
  codes: string[],
  labels: Record<string, string>,
): CatalogEntry[] =>
  codes.map((code) => ({ code, label: labels[code] ?? code }))

export const resolveConfig = (): CoreConfig => {
  const result: CoreConfig = {
    sourceId: env.string('SOURCE_ID', 'frigate'),
    redis: resolveRedisConfig({
      group: 'spotter-frigate',
      clientId: information.name,
    }),
    s3: {
      host: env.string('S3_HOST', ''),
      accessKey: env.string('S3_ACCESS', ''),
      secretKey: env.string('S3_SECRET', ''),
      bucket: env.string('S3_BUCKET', 'spotter'),
      stagingPrefix: env.string('S3_STAGING_PREFIX', 'staging'),
    },
    source: {
      type: env.string('SOURCE_TYPE', 'frigate') as SourceCode,
      frigate: {
        broker: env.string('MQTT_BROKER', ''),
      },
    },
    frigate: {
      remoteUrl: env.string('FRIGATE_REMOTE_URL', ''),
      authSecret: env.string('FRIGATE_AUTH_SECRET', ''),
      authUser: env.string('FRIGATE_AUTH_USER', ''),
    },
    timelapseStatePath: env.string(
      'TIMELAPSE_STATE_PATH',
      '/data/timelapse-exports.json',
    ),
    labels: defaultLabels,
  }

  requireConfig({
    REDIS_URL: result.redis.url,
    S3_HOST: result.s3?.host,
    S3_ACCESS: result.s3?.accessKey,
    S3_SECRET: result.s3?.secretKey,
    FRIGATE_REMOTE_URL: result.frigate.remoteUrl,
  })

  if (result.source.type === 'frigate' && !result.source.frigate.broker) {
    throw new Error('No mqtt broker found for the frigate source.')
  }

  applicationLogger.verbose('Using core configuration:', redactConfig(result))

  return result
}
