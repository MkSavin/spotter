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
    processStaged.mockImplementation(async (kind: string) => ({
      key: kind === 'video' ? 'event-media/clip.mp4' : 'event-media/snap.jpg',
    }))

    expect(await mediaStagedAction(payload, context)).toEqual({
      eventId: payload.eventId,
      clipKey: 'event-media/clip.mp4',
      clipParts: undefined,
      snapshotKey: 'event-media/snap.jpg',
    })
  })

  test('passes on the parts of a clip that was cut', async () => {
    processStaged.mockImplementation(async (kind: string) =>
      kind === 'video'
        ? {
            key: 'event-media/clip.mp4',
            parts: ['event-media/clip.part1.mp4', 'event-media/clip.part2.mp4'],
          }
        : { key: 'event-media/snap.jpg' },
    )

    expect(await mediaStagedAction(payload, context)).toMatchObject({
      clipKey: 'event-media/clip.mp4',
      clipParts: ['event-media/clip.part1.mp4', 'event-media/clip.part2.mp4'],
    })
  })

  test('rethrows a transient failure so the entry stays pending', async () => {
    // The regulator only skips the XACK when the handler throws — swallowing
    // an S3 blip here would drop the media for good.
    processStaged.mockImplementation(async (kind: string) => {
      if (kind === 'video') throw new TransientError('s3 get: reset')
      return { key: 'event-media/snap.jpg' }
    })

    await expect(mediaStagedAction(payload, context)).rejects.toThrow(
      TransientError,
    )
  })

  test('still delivers the snapshot when the clip fails permanently', async () => {
    processStaged.mockImplementation(async (kind: string) => {
      if (kind === 'video') throw new Error('Invalid data found')
      return { key: 'event-media/snap.jpg' }
    })

    expect(await mediaStagedAction(payload, context)).toEqual({
      eventId: payload.eventId,
      clipKey: undefined,
      clipParts: undefined,
      snapshotKey: 'event-media/snap.jpg',
    })
  })

  test('reports a final miss when both fail permanently', async () => {
    processStaged.mockImplementation(async () => {
      throw new Error('Invalid data found')
    })

    expect(await mediaStagedAction(payload, context)).toBeUndefined()
  })

  test('treats an ffmpeg timeout as final, not retryable', async () => {
    const { TranscodeError } = await import('../processing/transcode')
    processStaged.mockImplementation(async (kind: string) => {
      if (kind === 'video') {
        throw new TranscodeError('ffmpeg timed out after 120000ms', 614, true)
      }
      return undefined
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
