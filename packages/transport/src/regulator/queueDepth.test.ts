import { describe, expect, test } from 'bun:test'
import { entryAgeMs, readQueueDepth, readQueueDepths } from './queueDepth'

/** Stands in for Redis; `replies` is keyed by command. */
const client = (replies: Record<string, unknown | (() => never)>) => ({
  send: async (command: string) => {
    const reply = replies[command]
    if (typeof reply === 'function') return reply()
    return reply
  },
})

const group = (over: Record<string, unknown> = {}) => [
  { name: 'spotter-depot', lag: 0, pending: 0, ...over },
]

describe('entryAgeMs', () => {
  test('reads the epoch millis a stream id leads with', () => {
    expect(entryAgeMs('1700000000000-0', 1700000005000)).toBe(5000)
  })

  test('never reports a negative age when clocks disagree', () => {
    expect(entryAgeMs('1700000005000-0', 1700000000000)).toBe(0)
  })

  test('gives up on anything that is not an id', () => {
    expect(entryAgeMs(undefined)).toBeUndefined()
    expect(entryAgeMs('not-an-id')).toBeUndefined()
  })
})

describe('readQueueDepth', () => {
  test('reports lag and pending for the group', async () => {
    const depth = await readQueueDepth(
      client({
        XINFO: group({ lag: 12, pending: 3 }),
        XPENDING: [3, '1700000000000-0', '1700000000000-2', []],
      }),
      'spotter.media.staged',
      'spotter-depot',
    )

    expect(depth?.lag).toBe(12)
    expect(depth?.pending).toBe(3)
    expect(depth?.oldestPendingMs).toBeGreaterThan(0)
  })

  test('skips the age lookup when nothing is pending', async () => {
    let asked = false
    const depth = await readQueueDepth(
      {
        send: async (command: string) => {
          if (command === 'XPENDING') asked = true
          return group({ lag: 4 })
        },
      },
      'spotter.media.staged',
      'spotter-depot',
    )

    expect(depth).toEqual({
      stream: 'spotter.media.staged',
      lag: 4,
      pending: 0,
    })
    expect(asked).toBe(false)
  })

  test('a stream nobody has written to is not an error', async () => {
    // Every stream looks like this on a fresh install.
    const depth = await readQueueDepth(
      client({
        XINFO: () => {
          throw new Error('ERR no such key')
        },
      }),
      'spotter.media.staged',
      'spotter-depot',
    )

    expect(depth).toBeNull()
  })

  test('another service group on the same stream is ignored', async () => {
    const depth = await readQueueDepth(
      client({ XINFO: group({ name: 'spotter-server', lag: 99 }) }),
      'spotter.event',
      'spotter-depot',
    )

    expect(depth).toBeNull()
  })

  test('a null lag from Redis counts as zero, not NaN', async () => {
    const depth = await readQueueDepth(
      client({ XINFO: group({ lag: null }) }),
      'spotter.event',
      'spotter-depot',
    )

    expect(depth?.lag).toBe(0)
  })

  test('a failed age lookup still yields the counts', async () => {
    const depth = await readQueueDepth(
      {
        send: async (command: string) => {
          if (command === 'XPENDING') throw new Error('gone')
          return group({ pending: 2 })
        },
      },
      'spotter.event',
      'spotter-depot',
    )

    expect(depth?.pending).toBe(2)
    expect(depth?.oldestPendingMs).toBeUndefined()
  })
})

describe('readQueueDepths', () => {
  test('leaves out the quiet streams', async () => {
    const depths = await readQueueDepths(
      {
        send: async (_command: string, args: string[]) =>
          args[1] === 'busy' ? group({ lag: 7 }) : group(),
      },
      ['busy', 'quiet'],
      'spotter-depot',
    )

    // A row of zeroes on every beat would bury the one number that matters.
    expect(depths).toHaveLength(1)
    expect(depths[0].stream).toBe('busy')
  })

  test('one unreadable stream does not lose the others', async () => {
    const depths = await readQueueDepths(
      {
        send: async (_command: string, args: string[]) => {
          if (args[1] === 'broken') throw new Error('boom')
          return group({ lag: 5 })
        },
      },
      ['broken', 'fine'],
      'spotter-depot',
    )

    expect(depths).toHaveLength(1)
    expect(depths[0].stream).toBe('fine')
  })
})
