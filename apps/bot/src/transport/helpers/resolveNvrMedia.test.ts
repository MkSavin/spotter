import { describe, expect, mock, test } from 'bun:test'
import type { SpotterEvent } from '@spotter/transport'
import type { CoreContext } from '../../context'
import type { ResourceType } from '../../endpoint/Resource'
import { resolveNvrMedia } from './resolveNvrMedia'

const event = (overrides: Partial<SpotterEvent> = {}): SpotterEvent =>
  ({
    id: 'ev-1',
    camera: 'front',
    label: 'person',
    type: 'start',
    startTime: 1,
    endTime: null,
    score: 0.9,
    stationary: false,
    hasClip: true,
    hasSnapshot: true,
    ...overrides,
  }) as SpotterEvent

const context = (fetchRequest: (request: Request) => Promise<Response>) => {
  const composeResourceRequest = mock(
    (type: ResourceType) =>
      new Request(`https://nvr.local/${type}`, {
        headers: { Authorization: 'Bearer token' },
      }),
  )
  return {
    nvr: { composeResourceRequest, fetchRequest },
    logger: { debug: mock(() => undefined) },
  } as unknown as CoreContext
}

describe('resolveNvrMedia', () => {
  test('fetches only the media the event advertises', async () => {
    const fetchRequest = mock(async () => new Response('ok', { status: 200 }))
    const context_ = context(fetchRequest)

    const media = await resolveNvrMedia(
      event({ hasClip: true, hasSnapshot: false }),
      context_,
    )

    expect(fetchRequest).toHaveBeenCalledTimes(1)
    expect(media.hasClip).toBe(true)
    expect(media.hasSnapshot).toBe(false)
    expect(media.snapshot).toBeUndefined()
  })

  test('reports a resource missing when the NVR responds non-ok', async () => {
    const fetchRequest = mock(async () => new Response('nope', { status: 404 }))

    const media = await resolveNvrMedia(event(), context(fetchRequest))

    expect(media.hasClip).toBe(false)
    expect(media.hasSnapshot).toBe(false)
  })

  test('surfaces the request Authorization header for depot to reuse', async () => {
    const fetchRequest = mock(async () => new Response('ok', { status: 200 }))

    const media = await resolveNvrMedia(event(), context(fetchRequest))

    expect(media.endpointAuthorization).toBe('Bearer token')
  })

  test('does not fetch when the event has no media', async () => {
    const fetchRequest = mock(async () => new Response('ok'))

    const media = await resolveNvrMedia(
      event({ hasClip: false, hasSnapshot: false }),
      context(fetchRequest),
    )

    expect(fetchRequest).not.toHaveBeenCalled()
    expect(media.hasClip).toBe(false)
    expect(media.hasSnapshot).toBe(false)
  })
})
