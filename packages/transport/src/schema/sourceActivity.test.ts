import { describe, expect, test } from 'bun:test'
import {
  isSourceSilent,
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
