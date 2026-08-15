import { describe, expect, test } from 'bun:test'
import {
  parseSpotterEvent,
  resolveSource,
  type SpotterEvent,
  safeParseSpotterEvent,
  spotterEventSchema,
} from './spotterEvent'

const valid: SpotterEvent = {
  id: 'cam-1700000000.1-abc',
  source: 'frigate-home',
  camera: 'front',
  label: 'person',
  startTime: 1700000000,
  endTime: null,
  score: 0.9,
  stationary: false,
  hasClip: true,
  hasSnapshot: true,
  type: 'start',
}

describe('spotterEvent contract', () => {
  test('accepts a valid event', () => {
    expect(safeParseSpotterEvent(valid)).toEqual(valid)
    expect(() => parseSpotterEvent(valid)).not.toThrow()
  })

  test('allows nullable label and endTime', () => {
    expect(
      safeParseSpotterEvent({ ...valid, label: null, endTime: 1700000050 }),
    ).not.toBeNull()
  })

  test('source is optional during migration', () => {
    const { source, ...withoutSource } = valid
    const parsed = safeParseSpotterEvent(withoutSource)
    expect(parsed).not.toBeNull()
    expect(parsed?.source).toBeUndefined()
    expect(resolveSource({ source: parsed?.source })).toBe('frigate')
  })

  test('rejects empty source', () => {
    expect(safeParseSpotterEvent({ ...valid, source: '' })).toBeNull()
  })

  test('strips unknown keys', () => {
    const result = safeParseSpotterEvent({ ...valid, extra: 'ignored' })
    expect(result).toEqual(valid)
    expect(result).not.toHaveProperty('extra')
  })

  test('rejects missing required fields', () => {
    const { score, ...withoutScore } = valid
    expect(safeParseSpotterEvent(withoutScore)).toBeNull()
    expect(safeParseSpotterEvent({ ...valid, id: '' })).toBeNull()
  })

  test('rejects wrong types (no coercion)', () => {
    expect(safeParseSpotterEvent({ ...valid, score: '0.9' })).toBeNull()
    expect(safeParseSpotterEvent({ ...valid, stationary: 'false' })).toBeNull()
    // undefined is not null — must be coerced by producers
    expect(safeParseSpotterEvent({ ...valid, endTime: undefined })).toBeNull()
  })

  test('parse throws on invalid input', () => {
    expect(() => parseSpotterEvent({})).toThrow()
  })

  test('safeParse returns null for non-objects', () => {
    expect(safeParseSpotterEvent(null)).toBeNull()
    expect(safeParseSpotterEvent('nope')).toBeNull()
    expect(safeParseSpotterEvent(undefined)).toBeNull()
  })

  test('schema is exported and usable directly', () => {
    expect(spotterEventSchema.safeParse(valid).success).toBe(true)
  })
})
