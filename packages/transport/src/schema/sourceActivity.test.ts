import { describe, expect, test } from 'bun:test'
import {
  isSourceSilent,
  isSourceUnreachable,
  SOURCE_SILENT_MS,
  type SourceActivity,
} from './heartbeat'

const HOUR = 3600_000
const now = 1_700_000_000_000

const activity = (over: Partial<SourceActivity> = {}): SourceActivity => ({
  source: 'frigate',
  eventCount: 10,
  // Up for a day, so the process is old enough to judge silence.
  since: 86_400,
  lastEventAt: now - 60_000,
  ...over,
})

describe('isSourceSilent', () => {
  test('недавнее событие — тишины нет', () => {
    expect(isSourceSilent(activity(), now)).toBe(false)
  })

  test('порог ровно 6 часов', () => {
    expect(SOURCE_SILENT_MS).toBe(6 * HOUR)
  })

  test('пять часов молчания ещё не тревога', () => {
    const quiet = activity({ lastEventAt: now - 5 * HOUR })
    expect(isSourceSilent(quiet, now)).toBe(false)
  })

  test('семь часов молчания — тревога', () => {
    const quiet = activity({ lastEventAt: now - 7 * HOUR })
    expect(isSourceSilent(quiet, now)).toBe(true)
  })

  test('сутки молчания — ровно тот случай, что остался незамеченным', () => {
    const quiet = activity({ lastEventAt: now - 24 * HOUR })
    expect(isSourceSilent(quiet, now)).toBe(true)
  })

  test('свежий процесс без событий не тревожит', () => {
    // Just restarted: it cannot know whether the source is quiet, and warning
    // on every deploy would train the admin to ignore the warning.
    const young = activity({ lastEventAt: undefined, since: 600 })
    expect(isSourceSilent(young, now)).toBe(false)
  })

  test('давно поднятый процесс без единого события — тревога', () => {
    const old = activity({ lastEventAt: undefined, since: 86_400 })
    expect(isSourceSilent(old, now)).toBe(true)
  })

  test('порог настраивается', () => {
    const quiet = activity({ lastEventAt: now - 2 * HOUR })
    expect(isSourceSilent(quiet, now, HOUR)).toBe(true)
    expect(isSourceSilent(quiet, now, 3 * HOUR)).toBe(false)
  })
})

describe('isSourceUnreachable', () => {
  const contact = (over: Partial<SourceActivity> = {}): SourceActivity => ({
    source: 'frigate',
    eventCount: 0,
    since: 3600,
    reportsContact: true,
    lastContactAt: now - 10_000,
    ...over,
  })

  test('fresh housekeeping means the link is fine', () => {
    expect(isSourceUnreachable(contact(), now)).toBe(false)
  })

  test('a quiet night is not an outage', () => {
    // No events for twelve hours, but the NVR is still talking: this is the
    // case the event-silence check gets wrong.
    const quiet = contact({
      // Up for a day, so the event-silence check is old enough to judge.
      since: 86_400,
      lastEventAt: now - 12 * HOUR,
      lastContactAt: now - 20_000,
    })

    expect(isSourceUnreachable(quiet, now)).toBe(false)
    expect(isSourceSilent(quiet, now)).toBe(true)
  })

  test('a few missed rounds is not yet an outage', () => {
    // Frigate publishes stats once a minute, so a couple of gaps is a rough
    // patch, not a dead link — and an alert that cries wolf gets muted.
    expect(
      isSourceUnreachable(contact({ lastContactAt: now - 5 * 60_000 }), now),
    ).toBe(false)
  })

  test('a quarter of an hour of total silence is an outage', () => {
    // September 2026: the NVR lost its network and said nothing for 60 hours
    // while every other signal looked healthy.
    expect(
      isSourceUnreachable(contact({ lastContactAt: now - 20 * 60_000 }), now),
    ).toBe(true)
  })

  test('a just-started adapter is not yet an outage', () => {
    expect(
      isSourceUnreachable(
        contact({ lastContactAt: undefined, since: 30 }),
        now,
      ),
    ).toBe(false)
  })

  test('heard nothing for long enough after start is an outage', () => {
    expect(
      isSourceUnreachable(
        contact({ lastContactAt: undefined, since: 3600 }),
        now,
      ),
    ).toBe(true)
  })

  test('sources without housekeeping never raise it', () => {
    // Otherwise every adapter whose transport has no such traffic would alarm
    // permanently, and the signal would be turned off within a day.
    expect(
      isSourceUnreachable(
        contact({ lastContactAt: undefined, reportsContact: undefined }),
        now,
      ),
    ).toBe(false)
  })
})
