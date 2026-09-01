import { describe, expect, test } from 'bun:test'
import { shouldDeliver } from './shouldDeliver'

describe('shouldDeliver', () => {
  test('the default policy delivers everything', () => {
    expect(shouldDeliver({ severity: 'detection' }, 'all')).toBe(true)
    expect(shouldDeliver({ severity: 'alert' }, 'all')).toBe(true)
    expect(shouldDeliver({}, 'all')).toBe(true)
  })

  test('alerts-only drops what the NVR called a mere detection', () => {
    expect(shouldDeliver({ severity: 'detection' }, 'alerts')).toBe(false)
    expect(shouldDeliver({ severity: 'alert' }, 'alerts')).toBe(true)
  })

  test('an unclassified event is delivered even under alerts-only', () => {
    // An NVR that does not classify must not go silently quiet, and neither
    // must one whose review simply has not arrived yet.
    expect(shouldDeliver({}, 'alerts')).toBe(true)
    expect(shouldDeliver({ severity: undefined }, 'alerts')).toBe(true)
  })
})
