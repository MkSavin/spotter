import { describe, expect, test } from 'bun:test'
import { eventCode } from './eventCode'

describe('eventCode', () => {
  test('extracts the second dash-separated segment', () => {
    expect(eventCode('1700000000.1-42-abc')).toBe('42')
  })

  test('falls back to "unknown" for ids without a segment or empty input', () => {
    expect(eventCode('single')).toBe('unknown')
    expect(eventCode('')).toBe('unknown')
    expect(eventCode(undefined)).toBe('unknown')
    expect(eventCode(null)).toBe('unknown')
  })
})
