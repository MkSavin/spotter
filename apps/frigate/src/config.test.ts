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
  // Frigate `.strip()`s its own `.jwt_secret`, so a value copied out of that
  // file carries a newline that is invisible in .env and signs differently.
  test('a copied newline is trimmed off the secret', () => {
    withEnv({ FRIGATE_AUTH_SECRET: 'topsecret\n' })

    expect(resolveConfig().frigate.authSecret).toBe('topsecret')
  })

  test('surrounding spaces are trimmed from user and role', () => {
    withEnv({ FRIGATE_AUTH_USER: ' admin ', FRIGATE_AUTH_ROLE: ' viewer ' })

    const { frigate } = resolveConfig()
    expect(frigate.authUser).toBe('admin')
    expect(frigate.authRole).toBe('viewer')
  })

  test('the role defaults to admin, which exports and manual events need', () => {
    withEnv({ FRIGATE_AUTH_ROLE: undefined })

    expect(resolveConfig().frigate.authRole).toBe('admin')
  })
})

describe('frigate url', () => {
  test('FRIGATE_URL is read, trimmed', () => {
    withEnv({ FRIGATE_URL: '  http://frigate:5000  ' })

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
