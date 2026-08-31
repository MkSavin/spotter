import { describe, expect, test } from 'bun:test'
import { RedisConnection } from './RedisConnection'

/**
 * The client is swapped by rebuilding it, so these tests drive the wrapper
 * through its internals rather than a live Redis. The recovery itself is
 * verified against a real server in AUDIT_4.
 */
type Fake = {
  connected: boolean
  send: (command: string, args: string[]) => Promise<unknown>
  close: () => void
  connect: () => Promise<void>
}

const attach = (connection: RedisConnection, client: Fake): void => {
  ;(connection as unknown as { client: Fake }).client = client
}

const fake = (overrides: Partial<Fake> = {}): Fake => ({
  connected: true,
  send: async () => 'ok',
  close: () => undefined,
  connect: async () => undefined,
  ...overrides,
})

describe('RedisConnection.send', () => {
  test('passes a successful command straight through', async () => {
    const connection = new RedisConnection('redis://localhost:1')
    attach(connection, fake({ send: async () => 'value' }))

    expect(await connection.send('GET', ['k'])).toBe('value')
  })

  test('rethrows an ordinary command error without rebuilding', async () => {
    const connection = new RedisConnection('redis://localhost:1')
    let builds = 0
    ;(connection as unknown as { build: () => Promise<unknown> }).build =
      async () => {
        builds += 1
        return fake()
      }
    // Still connected: a WRONGTYPE is the command's fault, not the socket's.
    attach(
      connection,
      fake({
        connected: true,
        send: async () => {
          throw new Error('WRONGTYPE Operation against a key')
        },
      }),
    )

    await expect(connection.send('GET', ['k'])).rejects.toThrow(/WRONGTYPE/)
    expect(builds).toBe(0)
  })

  test('rebuilds and retries once when the client is dead', async () => {
    const connection = new RedisConnection('redis://localhost:1')
    const dead = fake({
      connected: false,
      send: async () => {
        throw new Error('Connection has failed')
      },
    })
    attach(connection, dead)

    let rebuilt = false
    ;(
      connection as unknown as { build: (r?: unknown) => Promise<unknown> }
    ).build = async () => {
      rebuilt = true
      const fresh = fake({ send: async () => 'after-rebuild' })
      attach(connection, fresh)
      return fresh
    }

    expect(await connection.send('GET', ['k'])).toBe('after-rebuild')
    expect(rebuilt).toBe(true)
  })

  test('a still-connected client is never treated as dead', async () => {
    const connection = new RedisConnection('redis://localhost:1')
    let builds = 0
    ;(connection as unknown as { build: () => Promise<unknown> }).build =
      async () => {
        builds += 1
        return fake()
      }
    attach(
      connection,
      fake({
        connected: true,
        send: async () => {
          throw new Error('Connection has failed')
        },
      }),
    )

    await expect(connection.send('GET', ['k'])).rejects.toThrow()
    expect(builds).toBe(0)
  })
})

describe('RedisConnection.replace', () => {
  test('concurrent callers share a single rebuild', async () => {
    const connection = new RedisConnection('redis://localhost:1')
    let builds = 0
    ;(
      connection as unknown as { build: (r?: unknown) => Promise<unknown> }
    ).build = async () => {
      builds += 1
      await Bun.sleep(10)
      return fake()
    }

    await Promise.all([
      connection.replace(),
      connection.replace(),
      connection.replace(),
    ])

    expect(builds).toBe(1)
  })

  test('a later replace builds again', async () => {
    const connection = new RedisConnection('redis://localhost:1')
    let builds = 0
    ;(
      connection as unknown as { build: (r?: unknown) => Promise<unknown> }
    ).build = async () => {
      builds += 1
      return fake()
    }

    await connection.replace()
    await connection.replace()

    expect(builds).toBe(2)
  })
})
