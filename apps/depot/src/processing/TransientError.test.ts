import { describe, expect, test } from 'bun:test'
import { settle, TransientError, transient } from './TransientError'

describe('transient', () => {
  test('passes the value through when the operation succeeds', async () => {
    expect(await transient('s3 get', async () => 'ok')).toBe('ok')
  })

  test('re-tags a failure as retryable, keeping the cause', async () => {
    const cause = new Error('connection reset')

    const error = await transient('s3 get', async () => {
      throw cause
    }).catch((caught) => caught)

    expect(error).toBeInstanceOf(TransientError)
    expect(error.message).toBe('s3 get: connection reset')
    expect(error.cause).toBe(cause)
  })
})

describe('settle', () => {
  test('captures a value', async () => {
    expect(await settle(async () => 'key')).toEqual({ value: 'key' })
  })

  test('captures an error instead of rejecting', async () => {
    const boom = new Error('boom')

    // Siblings run in parallel, so one rejection must not cancel the other.
    const outcome = await settle(async () => {
      throw boom
    })

    expect(outcome.error).toBe(boom)
    expect(outcome.value).toBeUndefined()
  })
})
