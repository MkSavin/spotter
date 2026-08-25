import { describe, expect, test } from 'bun:test'
import { parseFrigateEvent } from './parseFrigateEvent'

const frigate = (overrides: Record<string, unknown> = {}) => ({
  type: 'new',
  after: {
    id: 'cam-1700000000.1-abc',
    camera: 'front',
    label: 'person',
    start_time: 1700000000,
    end_time: null,
    score: 0.9,
    stationary: false,
    has_clip: true,
    has_snapshot: true,
    position_changes: 3,
    ...overrides,
  },
})

describe('parseFrigateEvent', () => {
  test('maps a valid payload to the SpotterEvent contract', () => {
    const event = parseFrigateEvent(frigate())

    expect(event).toEqual({
      id: 'cam-1700000000.1-abc',
      camera: 'front',
      label: 'person',
      startTime: 1700000000,
      endTime: null,
      score: 0.9,
      stationary: false,
      hasClip: true,
      hasSnapshot: true,
      type: 'start',
    })
  })

  test('normalizes type new/start → start, passes others through', () => {
    expect(parseFrigateEvent({ ...frigate(), type: 'new' }).type).toBe('start')
    expect(parseFrigateEvent({ ...frigate(), type: 'start' }).type).toBe(
      'start',
    )
    expect(parseFrigateEvent({ ...frigate(), type: 'end' }).type).toBe('end')
    expect(parseFrigateEvent({ ...frigate(), type: 'update' }).type).toBe(
      'update',
    )
  })

  test('coerces missing optional fields to contract shape', () => {
    const event = parseFrigateEvent(
      frigate({
        end_time: undefined,
        stationary: undefined,
        has_clip: undefined,
      }),
    )
    expect(event.endTime).toBeNull()
    expect(event.stationary).toBe(false)
    expect(event.hasClip).toBe(false)
  })

  test('throws on missing id / camera / label', () => {
    expect(() => parseFrigateEvent(frigate({ id: undefined }))).toThrow()
    expect(() => parseFrigateEvent(frigate({ camera: undefined }))).toThrow()
    expect(() => parseFrigateEvent(frigate({ label: undefined }))).toThrow()
  })

  test('throws on buggy updates with no position changes', () => {
    expect(() =>
      parseFrigateEvent({
        ...frigate({ position_changes: 0 }),
        type: 'update',
      }),
    ).toThrow()
  })

  test('keeps lifecycle events even with no position changes', () => {
    // A dropped `start` leaves the frontend without a message id, so every later
    // delivery re-sends the event as a new message. Frigate genuinely reports
    // position_changes: 0 on `new`, so the guard must not apply there.
    for (const type of ['new', 'start', 'end']) {
      const event = parseFrigateEvent({
        ...frigate({ position_changes: 0 }),
        type,
      })
      expect(event.type).toBe(type === 'end' ? 'end' : 'start')
    }
  })

  test('throws on empty / malformed input', () => {
    expect(() => parseFrigateEvent(null)).toThrow()
    expect(() => parseFrigateEvent({})).toThrow()
    expect(() => parseFrigateEvent({ type: 'new' })).toThrow()
  })
})
