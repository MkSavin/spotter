import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { resolveConfig } from './config'

const saved = { ...process.env }

/** Set explicitly: Bun loads the repository's `.env`, which CI does not have. */
const required = {
  REDIS_URL: 'redis://localhost:6379',
  S3_HOST: 'https://s3.example',
  S3_ACCESS: 'access',
  S3_SECRET: 'secret',
}

const withEnv = (vars: Record<string, string | undefined>) => {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

beforeEach(() => {
  process.env = { ...saved, ...required }
  withEnv({ VIDEO_TIMEOUT_MS: undefined, REDIS_RECLAIM_MIN_IDLE_MS: undefined })
})

afterEach(() => {
  process.env = { ...saved }
})

describe('resolveConfig', () => {
  test('таймаут транскодирования не связан с reclaim-окном', () => {
    // Transcoding runs outside the stream entry, so a long encode cannot be
    // re-dispatched mid-flight and the two no longer have to be ordered.
    withEnv({
      VIDEO_TIMEOUT_MS: '3600000',
      REDIS_RECLAIM_MIN_IDLE_MS: '300000',
    })

    const config = resolveConfig()

    expect(config.video.timeoutMs).toBe(3600000)
    expect(config.redis.reclaimMinIdleMs).toBe(300000)
  })

  test('reclaim остаётся коротким, как у остальных сервисов', () => {
    // It means "the replica died", and stretching it only delays that answer.
    expect(resolveConfig().redis.reclaimMinIdleMs).toBe(300000)
  })

  test('очередь по умолчанию кодирует по одному клипу', () => {
    expect(resolveConfig().video.concurrency).toBe(1)
  })
})
