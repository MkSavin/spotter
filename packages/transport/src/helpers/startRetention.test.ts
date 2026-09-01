import { describe, expect, test } from 'bun:test'
import { defaultLogger } from 'stenograph'
import { startRetention } from './startRetention'

const DAY_MS = 24 * 60 * 60 * 1000

describe('startRetention', () => {
  test('sweeps immediately, so a restarting service still trims', () => {
    const cutoffs: Date[] = []
    const stop = startRetention({
      label: 'test',
      retentionMs: DAY_MS,
      prune: (cutoff) => {
        cutoffs.push(cutoff)
        return 1
      },
      logger: defaultLogger,
    })
    stop()

    expect(cutoffs).toHaveLength(1)
    // The cutoff is one window back, not now.
    expect(Date.now() - cutoffs[0].getTime()).toBeGreaterThanOrEqual(
      DAY_MS - 1000,
    )
  })

  test('a throwing prune does not take the service down', () => {
    const stop = startRetention({
      label: 'test',
      retentionMs: DAY_MS,
      prune: () => {
        throw new Error('database is locked')
      },
      logger: defaultLogger,
    })

    expect(stop).not.toThrow()
  })

  test('stop clears the timer', () => {
    let sweeps = 0
    const stop = startRetention({
      label: 'test',
      retentionMs: DAY_MS,
      prune: () => {
        sweeps += 1
        return 0
      },
      logger: defaultLogger,
      intervalMs: 1,
    })
    stop()

    const after = sweeps
    return Bun.sleep(20).then(() => {
      expect(sweeps).toBe(after)
    })
  })
})
