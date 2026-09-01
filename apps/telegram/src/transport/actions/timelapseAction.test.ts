import { describe, expect, test } from 'bun:test'
import { formatElapsed } from './timelapseAction'

describe('formatElapsed', () => {
  test('reads the way a person would say it', () => {
    expect(formatElapsed(90 * 60_000)).toBe('1 ч 30 мин')
    expect(formatElapsed(120 * 60_000)).toBe('2 ч')
    expect(formatElapsed(25 * 60_000)).toBe('25 мин')
  })

  test('never reports zero: the export is running, however briefly', () => {
    expect(formatElapsed(0)).toBe('1 мин')
    expect(formatElapsed(5_000)).toBe('1 мин')
  })

  test('handles the eight-hour case that prompted this', () => {
    expect(formatElapsed(8 * 60 * 60_000)).toBe('8 ч')
  })
})
