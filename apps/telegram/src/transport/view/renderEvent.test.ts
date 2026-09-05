import { describe, expect, test } from 'bun:test'
import type { SpotterEvent } from '@spotter/transport'
import type { CoreContext } from '../../context'
import { renderEvent } from './renderEvent'

const context = {
  config: { source: 'frigate', timezone: 'UTC' },
  catalog: {
    objectLabel: (_source: string, code: string) => code,
    cameraLabel: (_source: string, code: string) => code,
  },
} as unknown as CoreContext

const event = (overrides: Partial<SpotterEvent> = {}): SpotterEvent => ({
  id: 'cam-htriyg-1',
  source: 'frigate',
  camera: 'front',
  label: 'person',
  startTime: 1700000000,
  endTime: 1700000010,
  score: 0.9,
  stationary: false,
  hasClip: false,
  hasSnapshot: false,
  type: 'end',
  ...overrides,
})

describe('renderEvent clip marker', () => {
  test('a clipless event says so, in words distinct from the snapshot mark', () => {
    const text = renderEvent(event(), context, { clipless: true })

    expect(text).toContain('🎞️ Без видео')
    // The two axes must stay visually apart: this is why the reel, not 📸/🙈.
    expect(text).not.toContain('🙈')
    expect(text).not.toContain('📸')
  })

  test('no marker without the flag', () => {
    expect(renderEvent(event(), context, {})).not.toContain('Без видео')
    expect(renderEvent(event(), context)).not.toContain('Без видео')
  })

  test('both axes show at once: no snapshot and no clip', () => {
    const text = renderEvent(event(), context, {
      media: 'absent',
      clipless: true,
    })

    expect(text).toContain('🙈 Без снимка')
    expect(text).toContain('🎞️ Без видео')
  })

  test('a pending snapshot coexists with a known-missing clip', () => {
    const text = renderEvent(event(), context, {
      media: 'pending',
      clipless: true,
    })

    expect(text).toContain('📸 В обработке')
    expect(text).toContain('🎞️ Без видео')
  })

  test('marks sit on the label line, leaving the timing line alone', () => {
    const lines = renderEvent(event(), context, {
      media: 'absent',
      clipless: true,
    }).split('\n')

    expect(lines[1]).toContain('Без снимка')
    expect(lines[1]).toContain('Без видео')
    expect(lines[2]).toStartWith('📅')
  })

  test('`ready` drops the snapshot mark but keeps the clip one', () => {
    const text = renderEvent(event(), context, {
      media: 'ready',
      clipless: true,
    })

    expect(text).not.toContain('Без снимка')
    expect(text).not.toContain('В обработке')
    expect(text).toContain('🎞️ Без видео')
  })
})
