import { afterEach, describe, expect, mock, test } from 'bun:test'
import { defaultLogger } from 'stenograph'
import { createManualEvent, endManualEvent } from './manualEvent'

const config = {
  remoteUrl: 'https://nvr.local',
  authSecret: 'secret',
  authUser: 'admin',
}

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('createManualEvent', () => {
  test('returns the event id Frigate assigned', async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({ success: true, event_id: '1700000000.0-abc123' }),
          { status: 200 },
        ),
    ) as never

    const id = await createManualEvent(
      config,
      { camera: 'yard', label: 'person', duration: 10 },
      defaultLogger,
    )

    expect(id).toBe('1700000000.0-abc123')
  })

  test('posts to the camera and label path', async () => {
    const seen: string[] = []
    globalThis.fetch = mock(async (input: Request | string) => {
      seen.push(typeof input === 'string' ? input : input.url)
      return new Response(JSON.stringify({ success: true, event_id: 'e1' }), {
        status: 200,
      })
    }) as never

    await createManualEvent(
      config,
      { camera: 'yard', label: 'car', duration: 5 },
      defaultLogger,
    )

    expect(seen[0]).toBe('https://nvr.local/api/events/yard/car/create')
  })

  test('returns undefined when the camera is unknown', async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({ success: false, message: 'not a valid camera.' }),
          { status: 404 },
        ),
    ) as never

    const id = await createManualEvent(
      config,
      { camera: 'ghost', label: 'person', duration: 10 },
      defaultLogger,
    )

    expect(id).toBeUndefined()
  })

  test('returns undefined when the NVR is unreachable', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('ECONNREFUSED')
    }) as never

    const id = await createManualEvent(
      config,
      { camera: 'yard', label: 'person', duration: 10 },
      defaultLogger,
    )

    expect(id).toBeUndefined()
  })
})

describe('endManualEvent', () => {
  test('puts to the event end path', async () => {
    const seen: string[] = []
    globalThis.fetch = mock(async (input: Request | string) => {
      seen.push(typeof input === 'string' ? input : input.url)
      return new Response('{}', { status: 200 })
    }) as never

    await endManualEvent(config, 'e1', defaultLogger)

    expect(seen[0]).toBe('https://nvr.local/api/events/e1/end')
  })

  test('swallows failures — the event may have ended on its own', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('timeout')
    }) as never

    expect(endManualEvent(config, 'e1', defaultLogger)).resolves.toBeUndefined()
  })
})
