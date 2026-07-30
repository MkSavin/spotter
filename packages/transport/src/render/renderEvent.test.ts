import { describe, expect, test } from 'bun:test'
import type { SpotterEvent } from '../schema/spotterEvent'
import { renderEvent, renderEventTiming } from './renderEvent'

const base: SpotterEvent = {
  id: 'cam-1700000000.123-abc',
  camera: 'front',
  label: 'person',
  startTime: 1700000000,
  endTime: null,
  score: 0.9,
  stationary: false,
  hasClip: false,
  hasSnapshot: true,
  type: 'start',
}

const tz = 'Europe/Moscow'

describe('renderEvent', () => {
  test('headline combines object and camera labels', () => {
    const rendered = renderEvent(
      base,
      { object: 'человек', camera: 'Двор' },
      tz,
    )
    expect(rendered.headline).toBe('человек · Двор')
    expect(rendered.time).toMatch(/^\d{2}:\d{2}$/)
  })

  test('timing shows only start when the event is open', () => {
    expect(renderEventTiming(base, tz)).not.toContain('|')
  })

  test('timing includes duration once the event has ended', () => {
    const ended = { ...base, endTime: base.startTime + 90 }
    const timing = renderEventTiming(ended, tz)
    expect(timing).toContain('|')
    expect(timing).toContain('1 мин')
  })

  test('duration over a day keeps hours in the 0–23 range', () => {
    const ended = { ...base, endTime: base.startTime + 25 * 60 * 60 }
    // 25h = 1 day + 1 hour, not "25 ч".
    expect(renderEventTiming(ended, tz)).toContain('1 дней 1 ч')
  })
})
