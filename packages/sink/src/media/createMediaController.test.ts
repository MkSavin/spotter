import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mediaStreams } from '@spotter/transport'
import { defaultLogger } from 'stenograph'
import type { SinkContext } from '../runtime/context'
import { createMediaController } from './createMediaController'
import type { MediaProvider } from './MediaProvider'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

const provider: MediaProvider = {
  resolveClip: (id) => new Request(`https://nvr/clip/${id}`),
  resolveSnapshot: (id) => new Request(`https://nvr/snapshot/${id}`),
  resolveFrame: (camera) => new Request(`https://nvr/frame/${camera}`),
}

const makeContext = () => {
  const published: Array<{ stream: string; payload: unknown }> = []
  const written: string[] = []

  const context = {
    sourceId: 'frigate-home',
    config: { s3: { stagingPrefix: 'staging' } },
    logger: defaultLogger,
    s3: {
      file: (key: string) => ({
        write: async () => {
          written.push(key)
        },
      }),
    },
    producer: {
      publish: async (stream: string, payload: unknown) => {
        published.push({ stream, payload })
        return '1-0'
      },
    },
  } as unknown as SinkContext

  return { context, published, written }
}

const message = (value: unknown) => ({
  topic: 'spotter.media.request.frigate-home',
  message: { value: JSON.stringify(value) } as never,
})

describe('createMediaController', () => {
  test('stages requested media and publishes MediaStaged', async () => {
    globalThis.fetch = mock(
      async () => new Response(new Uint8Array([1, 2, 3])),
    ) as never

    const { context, published, written } = makeContext()
    const controller = createMediaController(provider)

    await controller(
      message({
        eventId: 'e1',
        source: 'frigate-home',
        want: ['clip', 'snapshot'],
      }),
      context,
    )

    expect(written).toEqual([
      'staging/frigate-home/event-e1-clip.mp4',
      'staging/frigate-home/event-e1-snapshot.jpg',
    ])
    const staged = published.find(
      (entry) => entry.stream === mediaStreams.mediaStaged,
    )
    expect(staged?.payload).toEqual({
      eventId: 'e1',
      source: 'frigate-home',
      rawClipKey: 'staging/frigate-home/event-e1-clip.mp4',
      rawSnapshotKey: 'staging/frigate-home/event-e1-snapshot.jpg',
    })

    // The frontend follows these to move the "processing" button along.
    expect(
      published
        .filter((entry) => entry.stream === mediaStreams.mediaProgress)
        .map((entry) => (entry.payload as { stage: string }).stage),
    ).toEqual(['fetching', 'staged'])
  })

  test('ignores requests addressed to a different source', async () => {
    const { context, published } = makeContext()
    const controller = createMediaController(provider)

    await controller(
      message({ eventId: 'e1', source: 'other', want: ['clip'] }),
      context,
    )

    expect(published).toHaveLength(0)
  })

  test('answers with an empty result when the NVR has no media', async () => {
    globalThis.fetch = mock(
      async () => new Response('', { status: 404 }),
    ) as never

    const { context, published } = makeContext()
    const controller = createMediaController(provider)

    await controller(
      message({ eventId: 'e1', source: 'frigate-home', want: ['clip'] }),
      context,
    )

    // Silence would leave the bot's "processing" button stuck forever.
    const processed = published.find(
      (entry) => entry.stream === mediaStreams.mediaProcessed,
    )
    expect(processed?.payload).toEqual({ eventId: 'e1' })

    // And the button says why, instead of just going back to idle.
    const failure = published.find(
      (entry) =>
        entry.stream === mediaStreams.mediaProgress &&
        (entry.payload as { stage: string }).stage === 'failed',
    )
    expect(failure?.payload).toMatchObject({
      eventId: 'e1',
      stage: 'failed',
    })
  })
})
