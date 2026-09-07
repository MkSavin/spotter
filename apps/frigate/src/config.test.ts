import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { resolveConfig } from './config'

const saved = { ...process.env }

/**
 * What `resolveConfig` demands before it will return anything. Set explicitly
 * because Bun loads the repository's own `.env`, so a test that relied on the
 * ambient environment passed here and failed in CI, where no `.env` exists.
 */
const required = {
  REDIS_URL: 'redis://localhost:6379',
  MQTT_BROKER: 'mqtt://localhost:1883',
  S3_HOST: 'https://s3.example',
  S3_ACCESS: 'access',
  S3_SECRET: 'secret',
  FRIGATE_URL: 'https://frigate.example',
}

/** Only the keys under test; the rest keeps whatever the environment had. */
const withEnv = (vars: Record<string, string | undefined>) => {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

beforeEach(() => {
  // A stray FRIGATE_* from the developer's own `.env` would decide the result.
  process.env = { ...saved, ...required }
  delete process.env.FRIGATE_REMOTE_URL
  delete process.env.FRIGATE_AUTH_ROLE
})

afterEach(() => {
  process.env = { ...saved }
})

describe('frigate credentials', () => {
  test('the role defaults to admin, which exports and manual events need', () => {
    expect(resolveConfig().frigate.authRole).toBe('admin')
  })
})

describe('frigate url', () => {
  test('FRIGATE_URL is read', () => {
    withEnv({ FRIGATE_URL: 'http://frigate:5000' })

    expect(resolveConfig().frigate.remoteUrl).toBe('http://frigate:5000')
  })

  // The old name must keep working, or renaming it strands every live node.
  test('FRIGATE_REMOTE_URL still works when the new name is unset', () => {
    withEnv({
      FRIGATE_URL: undefined,
      FRIGATE_REMOTE_URL: 'http://legacy:5000',
    })

    expect(resolveConfig().frigate.remoteUrl).toBe('http://legacy:5000')
  })

  test('the new name wins when both are set', () => {
    withEnv({
      FRIGATE_URL: 'http://new:5000',
      FRIGATE_REMOTE_URL: 'http://old:5000',
    })

    expect(resolveConfig().frigate.remoteUrl).toBe('http://new:5000')
  })
})
