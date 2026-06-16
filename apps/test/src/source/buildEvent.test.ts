import { describe, expect, it } from 'bun:test'
import { safeParseSpotterEvent } from '@spotter/transport'
import { buildEvent, newEventId } from './buildEvent'

describe('buildEvent', () => {
  it('mints ids whose eventCode suffix is derivable', () => {
    const id = newEventId()
    expect(id).toMatch(/^\d+\.\d+-[a-z0-9]+$/)
    expect(id.split('-').at(1)).toBeTruthy()
  })

  it('produces a valid SpotterEvent for a start phase without media', () => {
    const event = buildEvent({
      id: 'x',
      camera: 'front',
      label: 'person',
      type: 'start',
      startTime: 1000,
    })

    expect(safeParseSpotterEvent(event)).not.toBeNull()
    expect(event.endTime).toBeNull()
    expect(event.hasClip).toBe(false)
    expect(event.hasSnapshot).toBe(false)
  })

  it('marks media available and sets endTime on the end phase', () => {
    const event = buildEvent({
      id: 'x',
      camera: 'front',
      label: 'person',
      type: 'end',
      startTime: 1000,
    })

    expect(safeParseSpotterEvent(event)).not.toBeNull()
    expect(event.endTime).toBe(1030)
    expect(event.hasClip).toBe(true)
    expect(event.hasSnapshot).toBe(true)
  })
})
