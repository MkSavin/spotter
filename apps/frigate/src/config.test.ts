import { afterEach, describe, expect, test } from 'bun:test'
import { resolveConfig } from './config'

const saved = { ...process.env }

/** Only the keys under test; the rest keeps whatever the environment had. */
const withEnv = (vars: Record<string, string | undefined>) => {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

afterEach(() => {
  process.env = { ...saved }
})

describe('frigate credentials', () => {
  test('the role defaults to admin, which exports and manual events need', () => {
    withEnv({ FRIGATE_AUTH_ROLE: undefined })

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
