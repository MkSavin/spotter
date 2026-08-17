import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { MediaStaged } from '@spotter/transport'
import { defaultLogger } from 'stenograph'
import { TransientError } from '../processing/TransientError'

// The action is exercised through a stubbed processStaged: the decision under
// test is which failures escape, not the transcoding itself.
const processStaged = mock()
mock.module('../processing/processStaged', () => ({ processStaged }))

const { mediaStagedAction } = await import('./mediaStagedAction')

const payload: MediaStaged = {
  eventId: 'cam-1700000000.123-abc',
  source: 'frigate',
  rawClipKey: 'staging/clip.mp4',
  rawSnapshotKey: 'staging/snap.jpg',
}

const context = {
  logger: defaultLogger,
  producer: { publish: async () => '1-0' },
} as never

beforeEach(() => {
  processStaged.mockReset()
})

describe('mediaStagedAction', () => {
  test('returns both processed keys on success', async () => {
    processStaged.mockImplementation(async (kind: string) =>
      kind === 'video' ? 'event-media/clip.mp4' : 'event-media/snap.jpg',
    )

    expect(await mediaStagedAction(payload, context)).toEqual({
      eventId: payload.eventId,
      clipKey: 'event-media/clip.mp4',
      snapshotKey: 'event-media/snap.jpg',
    })
  })

  test('rethrows a transient failure so the entry stays pending', async () => {
    // The regulator only skips the XACK when the handler throws — swallowing
    // an S3 blip here would drop the media for good.
    processStaged.mockImplementation(async (kind: string) => {
      if (kind === 'video') throw new TransientError('s3 get: reset')
      return 'event-media/snap.jpg'
    })

    await expect(mediaStagedAction(payload, context)).rejects.toThrow(
      TransientError,
    )
  })

  test('still delivers the snapshot when the clip fails permanently', async () => {
    processStaged.mockImplementation(async (kind: string) => {
      if (kind === 'video') throw new Error('Invalid data found')
      return 'event-media/snap.jpg'
    })

    expect(await mediaStagedAction(payload, context)).toEqual({
      eventId: payload.eventId,
      clipKey: undefined,
      snapshotKey: 'event-media/snap.jpg',
    })
  })

  test('reports a final miss when both fail permanently', async () => {
    processStaged.mockImplementation(async () => {
      throw new Error('Invalid data found')
    })

    expect(await mediaStagedAction(payload, context)).toBeUndefined()
  })

  test('prefers the retry when one kind is transient and the other is not', async () => {
    processStaged.mockImplementation(async (kind: string) => {
      if (kind === 'video') throw new Error('Invalid data found')
      throw new TransientError('s3 get: reset')
    })

    await expect(mediaStagedAction(payload, context)).rejects.toThrow(
      TransientError,
    )
  })
})
