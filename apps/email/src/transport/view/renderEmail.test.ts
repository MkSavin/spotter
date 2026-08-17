import { describe, expect, test } from 'bun:test'
import { CatalogCache, type SpotterEvent } from '@spotter/transport'
import { defaultLogger } from 'stenograph'
import type { Config } from '../../config'
import type { CoreContext } from '../../context'
import { renderEmail } from './renderEmail'

const makeEvent = (overrides: Partial<SpotterEvent> = {}): SpotterEvent => ({
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
  ...overrides,
})

const makeContext = (): CoreContext => {
  const catalog = new CatalogCache(defaultLogger.sub('test'))
  catalog.apply({
    source: 'frigate',
    cameras: [{ code: 'front', label: 'Двор' }],
    objectTypes: [{ code: 'person', label: 'человек' }],
  })

  return {
    config: {
      timezone: 'Europe/Moscow',
      source: 'frigate',
      presignExpiry: 3600,
      publicUrl: 'https://spotter.example',
    } as Config,
    catalog,
  } as CoreContext
}

describe('renderEmail', () => {
  test('subject carries camera, object and time; body has both parts', () => {
    const { subject, text, html } = renderEmail(makeEvent(), makeContext())

    expect(subject).toContain('Двор')
    expect(subject).toContain('человек')
    expect(subject.startsWith('SPOTTER')).toBe(true)

    expect(text).toContain('человек · Двор')
    expect(html).toContain('<strong>человек</strong>')
    expect(html).toContain('<strong>Двор</strong>')
  })

  test('includes snapshot image and event link when media provided', () => {
    const { text, html } = renderEmail(makeEvent(), makeContext(), {
      snapshotUrl: 'https://s3.example/snap.jpg',
      eventUrl: 'https://spotter.example/event/evt-1',
    })

    expect(html).toContain('<img src="https://s3.example/snap.jpg"')
    expect(html).toContain('href="https://spotter.example/event/evt-1"')
    expect(text).toContain('https://s3.example/snap.jpg')
  })

  test('falls back to placeholder labels for unknown codes', () => {
    const { subject } = renderEmail(
      makeEvent({ camera: 'unknown-cam', label: 'ufo' }),
      makeContext(),
    )
    expect(subject).toContain('неизв. камера')
    expect(subject).toContain('неизв. объект')
  })

  test('escapes HTML in dynamic values', () => {
    const context = makeContext()
    context.catalog.apply({
      source: 'frigate',
      cameras: [{ code: 'front', label: '<script>' }],
      objectTypes: [{ code: 'person', label: 'человек' }],
    })

    const { html } = renderEmail(makeEvent(), context)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
