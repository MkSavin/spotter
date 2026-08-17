import { describe, expect, test } from 'bun:test'
import { resolveEventTestPayload } from './eventTestAction'

const now = 1700000000000

describe('resolveEventTestPayload', () => {
  test('keeps a supplied id and reads its leading timestamp', () => {
    // Frigate ids lead with the event timestamp, so re-seeding an existing id
    // must reproduce its original time rather than stamping now.
    const payload = resolveEventTestPayload(
      { eventId: '1699999999.5-abc', type: 'end' },
      now,
    )

    expect(payload.eventId).toBe('1699999999.5-abc')
    expect(payload.timestamp).toBe(1699999999.5)
    expect(payload.type).toBe('end')
  })

  test('generates an id and falls back to now when none is supplied', () => {
    const payload = resolveEventTestPayload({}, now)

    expect(payload.eventId).toStartWith(`${now}-`)
    expect(payload.timestamp).toBe(now)
    expect(payload.type).toBe('start')
  })

  test('falls back to now when the id carries no parsable timestamp', () => {
    const payload = resolveEventTestPayload({ eventId: 'manual-seed' }, now)

    expect(payload.eventId).toBe('manual-seed')
    expect(payload.timestamp).toBe(now)
  })

  test('rejects a type that is not one of the three known kinds', () => {
    // The seed stream is operator-driven, so junk must not reach the payload.
    expect(resolveEventTestPayload({ type: 'bogus' }, now).type).toBe('start')
    expect(resolveEventTestPayload({ type: 42 }, now).type).toBe('start')
  })

  test('ignores a non-string id', () => {
    const payload = resolveEventTestPayload({ eventId: 12345 }, now)

    expect(payload.eventId).toStartWith(`${now}-`)
    expect(payload.timestamp).toBe(now)
  })
})
