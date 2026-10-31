import { describe, expect, test } from 'bun:test'
import type { DeliveryEvent } from '@spotter/transport'
import { needsUpload } from './deliveryEventController'

const media = (over: Partial<DeliveryEvent> = {}): DeliveryEvent => ({
  eventId: 'cam-1',
  action: 'media',
  clipKey: 'event-media/clip.mp4',
  event: {
    id: 'cam-1',
    camera: 'front',
    label: 'person',
    startTime: 1,
    endTime: 2,
    score: 0.9,
    stationary: false,
    hasClip: true,
    hasSnapshot: false,
    type: 'end',
  },
  ...over,
})

const LIMIT = 50_000_000

describe('needsUpload', () => {
  test('a clip Telegram fetches by URL stays inline', () => {
    expect(needsUpload(media({ clipBytes: 15_000_000 }), LIMIT)).toBe(false)
  })

  test('a clip that travels as bytes goes to the queue', () => {
    expect(needsUpload(media({ clipBytes: 30_000_000 }), LIMIT)).toBe(true)
  })

  test('a clip over the upload limit is settled inline with a caption', () => {
    expect(needsUpload(media({ clipBytes: 90_000_000 }), LIMIT)).toBe(false)
  })

  test('an unknown size is taken as bytes', () => {
    expect(needsUpload(media(), LIMIT)).toBe(true)
  })

  test('a cut clip is judged by its first part', () => {
    expect(
      needsUpload(
        media({
          clipParts: ['a', 'b'],
          clipPartBytes: [15_000_000, 15_000_000],
        }),
        LIMIT,
      ),
    ).toBe(false)
    expect(
      needsUpload(
        media({
          clipParts: ['a', 'b'],
          clipPartBytes: [30_000_000, 15_000_000],
        }),
        LIMIT,
      ),
    ).toBe(true)
  })

  test('text and snapshot deliveries never queue', () => {
    expect(needsUpload(media({ action: 'create' }), LIMIT)).toBe(false)
    expect(
      needsUpload(
        media({ clipKey: undefined, snapshotKey: 'event-media/snap.jpg' }),
        LIMIT,
      ),
    ).toBe(false)
  })
})
