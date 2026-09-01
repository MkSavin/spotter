import { describe, expect, test } from 'bun:test'
import { parseFrigateReview } from './parseFrigateReview'

const review = (overrides: Record<string, unknown> = {}) => ({
  type: 'update',
  after: {
    id: '1718987129.308396-fqk5ka',
    camera: 'front_cam',
    severity: 'alert',
    data: { detections: ['ev-1', 'ev-2'], objects: ['person'], zones: [] },
    ...overrides,
  },
})

describe('parseFrigateReview', () => {
  test('reads the severity and the events it covers', () => {
    expect(parseFrigateReview(review())).toEqual({
      severity: 'alert',
      eventIds: ['ev-1', 'ev-2'],
    })
  })

  test('detections are carried through as well', () => {
    const parsed = parseFrigateReview(review({ severity: 'detection' }))
    expect(parsed?.severity).toBe('detection')
  })

  test('falls back to `before` when the update has no `after`', () => {
    const { after } = review()
    expect(parseFrigateReview({ before: after })?.severity).toBe('alert')
  })

  test('skips reviews covering no events', () => {
    expect(parseFrigateReview(review({ data: { detections: [] } }))).toBeNull()
    expect(parseFrigateReview(review({ data: {} }))).toBeNull()
  })

  test('skips an unknown severity rather than guessing', () => {
    expect(parseFrigateReview(review({ severity: 'whatever' }))).toBeNull()
  })

  test('survives the malformed payloads Frigate does send', () => {
    expect(parseFrigateReview(null)).toBeNull()
    expect(parseFrigateReview({})).toBeNull()
    expect(parseFrigateReview({ after: {} })).toBeNull()
  })
})
