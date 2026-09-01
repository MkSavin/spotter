import { describe, expect, test } from 'bun:test'
import { ReviewVerdicts } from './ReviewVerdicts'

describe('ReviewVerdicts', () => {
  test('an unknown event has no verdict', () => {
    expect(new ReviewVerdicts().severityOf('ev-1')).toBeUndefined()
  })

  test('a recorded verdict applies to every event it covered', () => {
    const verdicts = new ReviewVerdicts()
    verdicts.record(['ev-1', 'ev-2'], 'alert')

    expect(verdicts.severityOf('ev-1')).toBe('alert')
    expect(verdicts.severityOf('ev-2')).toBe('alert')
  })

  test('a later review overrides an earlier one', () => {
    // Frigate promotes a detection to an alert as activity develops.
    const verdicts = new ReviewVerdicts()
    verdicts.record(['ev-1'], 'detection', 1000)
    verdicts.record(['ev-1'], 'alert', 2000)

    expect(verdicts.severityOf('ev-1', 2000)).toBe('alert')
  })

  test('a verdict past its TTL is forgotten', () => {
    const verdicts = new ReviewVerdicts(60_000)
    verdicts.record(['ev-1'], 'alert', 1000)

    expect(verdicts.severityOf('ev-1', 30_000)).toBe('alert')
    expect(verdicts.severityOf('ev-1', 100_000)).toBeUndefined()
  })

  test('recording sweeps entries nobody will ask about again', () => {
    const verdicts = new ReviewVerdicts(60_000)
    verdicts.record(['old'], 'alert', 0)
    verdicts.record(['fresh'], 'alert', 100_000)

    expect(verdicts.size).toBe(1)
  })
})
