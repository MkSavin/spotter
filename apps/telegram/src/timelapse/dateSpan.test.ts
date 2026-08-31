import { describe, expect, test } from 'bun:test'
import { formatSpan, parseDateSpan, zonedTime } from './dateSpan'

const ZONE = 'Europe/Moscow'
// A fixed "now" so `сегодня` is deterministic: 2026-08-15 12:00 MSK.
const NOW = new Date('2026-08-15T09:00:00Z')

describe('zonedTime', () => {
  test('interprets wall-clock time in the given zone, not UTC', () => {
    // Moscow is UTC+3 year round.
    expect(zonedTime(ZONE, 2026, 8, 15)).toBe(
      Math.floor(Date.parse('2026-08-14T21:00:00Z') / 1000),
    )
    expect(zonedTime(ZONE, 2026, 8, 15, 9, 30)).toBe(
      Math.floor(Date.parse('2026-08-15T06:30:00Z') / 1000),
    )
  })

  test('handles a zone with daylight saving on both sides of the switch', () => {
    // Berlin: CEST (+2) in August, CET (+1) in January.
    expect(zonedTime('Europe/Berlin', 2026, 8, 15, 12)).toBe(
      Math.floor(Date.parse('2026-08-15T10:00:00Z') / 1000),
    )
    expect(zonedTime('Europe/Berlin', 2026, 1, 15, 12)).toBe(
      Math.floor(Date.parse('2026-01-15T11:00:00Z') / 1000),
    )
  })

  test('rolls a day past the end of the month', () => {
    expect(zonedTime(ZONE, 2026, 8, 32)).toBe(zonedTime(ZONE, 2026, 9, 1))
  })
})

describe('parseDateSpan', () => {
  test('a bare date covers that whole local day', () => {
    const span = parseDateSpan('15.08.2026', ZONE, NOW)

    expect(span).toEqual({
      start: zonedTime(ZONE, 2026, 8, 15),
      end: zonedTime(ZONE, 2026, 8, 16),
    })
    // Exactly 24h, so nothing at the edges is dropped.
    expect((span as any).end - (span as any).start).toBe(86_400)
  })

  test('infers the current year when it is omitted', () => {
    expect(parseDateSpan('15.08', ZONE, NOW)).toEqual(
      parseDateSpan('15.08.2026', ZONE, NOW) as never,
    )
  })

  test('understands сегодня and вчера', () => {
    expect(parseDateSpan('сегодня', ZONE, NOW)).toEqual(
      parseDateSpan('15.08.2026', ZONE, NOW) as never,
    )
    expect(parseDateSpan('вчера', ZONE, NOW)).toEqual(
      parseDateSpan('14.08.2026', ZONE, NOW) as never,
    )
  })

  test('вчера crosses a month boundary', () => {
    const firstOfMonth = new Date('2026-08-01T09:00:00Z')
    expect(parseDateSpan('вчера', ZONE, firstOfMonth)).toEqual(
      parseDateSpan('31.07.2026', ZONE, firstOfMonth) as never,
    )
  })

  test('accepts an explicit time window', () => {
    expect(parseDateSpan('15.08.2026 09:00-18:00', ZONE, NOW)).toEqual({
      start: zonedTime(ZONE, 2026, 8, 15, 9),
      end: zonedTime(ZONE, 2026, 8, 15, 18),
    })
  })

  test('accepts bare hours and alternative separators', () => {
    expect(parseDateSpan('15/08/2026 9-18', ZONE, NOW)).toEqual(
      parseDateSpan('15.08.2026 09:00-18:00', ZONE, NOW) as never,
    )
    expect(parseDateSpan('15-08-26 9-18', ZONE, NOW)).toEqual(
      parseDateSpan('15.08.2026 09:00-18:00', ZONE, NOW) as never,
    )
  })

  test('rejects an impossible date instead of rolling it over', () => {
    // Date would happily turn this into 1 March.
    expect(parseDateSpan('32.01.2026', ZONE, NOW)).toBeNull()
    expect(parseDateSpan('30.02.2026', ZONE, NOW)).toBeNull()
    expect(parseDateSpan('15.13.2026', ZONE, NOW)).toBeNull()
  })

  test('rejects a window that does not move forward', () => {
    expect(parseDateSpan('15.08.2026 18:00-09:00', ZONE, NOW)).toBeNull()
    expect(parseDateSpan('15.08.2026 09:00-09:00', ZONE, NOW)).toBeNull()
  })

  test('rejects nonsense', () => {
    expect(parseDateSpan('', ZONE, NOW)).toBeNull()
    expect(parseDateSpan('позавчера', ZONE, NOW)).toBeNull()
    expect(parseDateSpan('15.08.2026 09:00', ZONE, NOW)).toBeNull()
    expect(parseDateSpan('15.08.2026 25:00-26:00', ZONE, NOW)).toBeNull()
  })
})

describe('formatSpan', () => {
  test('renders the span back in local time', () => {
    const span = parseDateSpan('15.08.2026 09:00-18:00', ZONE, NOW)
    expect(formatSpan(span as never, ZONE)).toBe('15.08, 09:00 — 15.08, 18:00')
  })
})
