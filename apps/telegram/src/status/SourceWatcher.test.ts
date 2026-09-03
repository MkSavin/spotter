import { describe, expect, test } from 'bun:test'
import type { Heartbeat } from '@spotter/transport'
import { defaultLogger } from 'stenograph'
import { type SourceAlert, SourceWatcher } from './SourceWatcher'

defaultLogger.disable()
const logger = defaultLogger.sub('test')

const now = 1_700_000_000_000
const MINUTE = 60_000
const HOUR = 3600_000

/** `at` matters: a report older than HEARTBEAT_STALE_MS is not judged at all. */
const beat = (
  source: Partial<Heartbeat['source']> = {},
  at: number = now,
): Heartbeat =>
  ({
    service: 'frigate',
    version: '1.0.0',
    node: 'ingest',
    uptime: 86_400,
    at,
    source: {
      source: 'frigate',
      eventCount: 10,
      since: 86_400,
      reportsContact: true,
      lastContactAt: now - 20_000,
      lastEventAt: now - MINUTE,
      ...source,
    },
  }) as Heartbeat

const watch = () => {
  const alerts: SourceAlert[] = []
  const watcher = new SourceWatcher(logger, {
    onAlert: (alert) => alerts.push(alert),
  })
  return { alerts, watcher }
}

describe('SourceWatcher', () => {
  test('a healthy source raises nothing', () => {
    const { alerts, watcher } = watch()
    watcher.apply(beat())
    watcher.check(now)

    expect(alerts).toEqual([])
  })

  test('an NVR that stopped talking raises an alert', () => {
    // September 2026: the link died, the adapter kept beating, nothing said so.
    const { alerts, watcher } = watch()
    watcher.apply(beat({ lastContactAt: now - 20 * MINUTE }))
    watcher.check(now)

    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({
      source: 'frigate',
      node: 'ingest',
      fault: 'unreachable',
    })
  })

  test('a quiet night alone is not an outage', () => {
    // Housekeeping still arriving, so the link is fine even with no events.
    const { alerts, watcher } = watch()
    watcher.apply(beat({ lastEventAt: now - 12 * HOUR }))
    watcher.check(now)

    expect(alerts).toEqual([])
  })

  test('half a day with no events at all does raise one', () => {
    const { alerts, watcher } = watch()
    watcher.apply(
      beat({
        lastEventAt: now - 12 * HOUR,
        reportsContact: undefined,
        lastContactAt: undefined,
      }),
    )
    watcher.check(now)

    expect(alerts[0]?.fault).toBe('silent')
  })

  test('a standing fault is announced once, not every check', () => {
    // The alternative gets muted within a day, and then the next one is unseen.
    const { alerts, watcher } = watch()
    watcher.apply(beat({ lastContactAt: now - 20 * MINUTE }))

    watcher.check(now)
    watcher.check(now + MINUTE)
    watcher.check(now + 2 * MINUTE)

    expect(alerts).toHaveLength(1)
  })

  test('recovery is announced too, with how long it lasted', () => {
    const { alerts, watcher } = watch()
    watcher.apply(beat({ lastContactAt: now - 20 * MINUTE }))
    watcher.check(now)

    watcher.apply(beat({ lastContactAt: now + 30 * MINUTE }, now + 30 * MINUTE))
    watcher.check(now + 30 * MINUTE)

    expect(alerts).toHaveLength(2)
    expect(alerts[1]).toMatchObject({ recovered: true, fault: 'unreachable' })
    expect(alerts[1].forSeconds).toBe(30 * 60)
  })

  test('escalating from silent to unreachable keeps the original start', () => {
    // The outage did not begin again — it got worse, and the duration should
    // say how long the NVR has actually been unwell.
    const { alerts, watcher } = watch()
    watcher.apply(
      beat({
        lastEventAt: now - 12 * HOUR,
        reportsContact: undefined,
        lastContactAt: undefined,
      }),
    )
    watcher.check(now)

    watcher.apply(beat({ lastContactAt: now - 20 * MINUTE }, now + 10 * MINUTE))
    watcher.check(now + 10 * MINUTE)

    expect(alerts.map((alert) => alert.fault)).toEqual([
      'silent',
      'unreachable',
    ])
    expect(alerts[1].forSeconds).toBe(10 * 60)
  })

  test('sources without housekeeping are judged on events alone', () => {
    const { alerts, watcher } = watch()
    watcher.apply(beat({ reportsContact: undefined, lastContactAt: undefined }))
    watcher.check(now)

    expect(alerts).toEqual([])
  })

  test('a dead adapter is not reported as a dead NVR', () => {
    // Its last report freezes in place and would age into "unreachable",
    // sending the reader to inspect the wrong machine entirely. A silent
    // adapter is its own fault, and HEARTBEAT_STALE_MS already covers it.
    const { alerts, watcher } = watch()
    watcher.apply(beat({ lastContactAt: now - 20 * MINUTE }))

    // Five minutes on, with no beat since: well past HEARTBEAT_STALE_MS.
    watcher.check(now + 5 * MINUTE)

    expect(alerts).toEqual([])
  })

  test('a service with no source at all is ignored', () => {
    const { alerts, watcher } = watch()
    watcher.apply({ ...beat(), source: undefined } as Heartbeat)
    watcher.check(now)

    expect(alerts).toEqual([])
  })
})
