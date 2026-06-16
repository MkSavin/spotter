import { describe, expect, test } from 'bun:test'
import { timeout } from './timeout'

describe('timeout helper', () => {
  test('resolves after given time (approx)', async () => {
    const start = Date.now()
    await timeout(50)
    const elapsed = Date.now() - start
    // allow some slack for scheduler; ensure at least ~40ms elapsed
    expect(elapsed).toBeGreaterThanOrEqual(40)
  })

  test('resolves immediately for 0', async () => {
    const start = Date.now()
    await timeout(0)
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(20)
  })

  test('does not block synchronous code (async completion)', async () => {
    let flag = false

    const p = timeout(30).then(() => {
      flag = true
    })

    // immediately after scheduling, flag should still be false
    expect(flag).toBe(false)
    await p
    expect(flag).toBe(true)
  })
})
