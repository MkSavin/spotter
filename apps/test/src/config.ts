import path from 'node:path'
import type { SinkConfig } from '@spotter/sink'
import { type CatalogEntry, env, resolveRedisConfig } from '@spotter/transport'
import information from '../package.json'
import { applicationLogger } from './log'

/** Display labels for the synthetic catalog, keyed by code. */
export type TestLabels = {
  cameras: Record<string, string>
  objects: Record<string, string>
}

export type TestConfig = SinkConfig & {
  /** Routing id of this instance — the `<source>` in stream/key names. */
  sourceId: string
  /** Synthetic catalog published so the bot's labels/camera_list work offline. */
  labels: TestLabels
  /** Local fixtures served instead of a real NVR. */
  fixtures: {
    clip: string
    snapshot: string
    frame: string
  }
}

const defaultLabels: TestLabels = {
  objects: {
    person: '🧍 человек',
    car: '🚗 машина',
    dog: '🐶 собака',
    cat: '😺 кот',
  },
  cameras: {
    front: '🎥 передняя',
    side: '🎥 боковая',
    yard: '🎥 двор',
  },
}

export const toCatalogEntries = (
  codes: string[],
  labels: Record<string, string>,
): CatalogEntry[] =>
  codes.map((code) => ({ code, label: labels[code] ?? code }))

/** Resolve `data/<name>` relative to this app regardless of cwd. */
const fixturePath = (name: string): string =>
  env.string(
    `TEST_FIXTURE_${name.split('.')[0].toUpperCase()}`,
    path.join(import.meta.dir, '..', 'data', name),
  )

export const resolveConfig = (): TestConfig => {
  const config: TestConfig = {
    sourceId: env.string('SOURCE_ID', 'test'),
    redis: resolveRedisConfig({
      group: 'spotter-test',
      clientId: information.name,
    }),
    s3: {
      host: env.string('S3_HOST', ''),
      accessKey: env.string('S3_ACCESS', ''),
      secretKey: env.string('S3_SECRET', ''),
      bucket: env.string('S3_BUCKET', 'spotter'),
      stagingPrefix: env.string('S3_STAGING_PREFIX', 'staging'),
    },
    labels: defaultLabels,
    fixtures: {
      clip: fixturePath('clip.mp4'),
      snapshot: fixturePath('snapshot.jpg'),
      frame: fixturePath('frame.jpg'),
    },
  }

  if (!config.redis.url) {
    throw new Error('No redis url found.')
  }

  if (!config.s3?.host) {
    throw new Error('No s3 host found for media staging.')
  }

  applicationLogger.verbose('Using core configuration:', config)

  return config
}
