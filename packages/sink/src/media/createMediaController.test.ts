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
      rawSnapshotKey: 'staging/frigate-home/event-e1-snapshot.jpg',
    })

    const stagedClip = published.find(
      (entry) => entry.stream === mediaStreams.mediaStagedClip,
    )
    expect(stagedClip?.payload).toEqual({
      eventId: 'e1',
      source: 'frigate-home',
      rawClipKey: 'staging/frigate-home/event-e1-clip.mp4',
    })

    // The frontend follows these to move the "processing" button along.
    expect(
      published
        .filter((entry) => entry.stream === mediaStreams.mediaProgress)
        .map((entry) => (entry.payload as { stage: string }).stage),
    ).toEqual(['fetching', 'staged'])
  })

  test('a snapshot-only request never touches the clip stream', async () => {
    globalThis.fetch = mock(
      async () => new Response(new Uint8Array([1, 2, 3])),
    ) as never

    const { context, published } = makeContext()
    const controller = createMediaController(provider)

    await controller(
      message({ eventId: 'e2', source: 'frigate-home', want: ['snapshot'] }),
      context,
    )

    const streams = published.map((entry) => entry.stream)
    expect(streams).toContain(mediaStreams.mediaStaged)
    expect(streams).not.toContain(mediaStreams.mediaStagedClip)
  })

  test('a clip-only request never touches the snapshot stream', async () => {
    globalThis.fetch = mock(
      async () => new Response(new Uint8Array([1, 2, 3])),
    ) as never

    const { context, published } = makeContext()
    const controller = createMediaController(provider)

    await controller(
      message({ eventId: 'e3', source: 'frigate-home', want: ['clip'] }),
      context,
    )

    const streams = published.map((entry) => entry.stream)
    expect(streams).toContain(mediaStreams.mediaStagedClip)
    expect(streams).not.toContain(mediaStreams.mediaStaged)
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

  test('reports the miss and rethrows so the entry is retried', async () => {
    globalThis.fetch = mock(
      async () => new Response('', { status: 404 }),
    ) as never

    const { context, published } = makeContext()
    const controller = createMediaController(provider)

    await expect(
      controller(
        message({ eventId: 'e1', source: 'frigate-home', want: ['clip'] }),
        context,
      ),
    ).rejects.toThrow(/Nothing staged/)

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
