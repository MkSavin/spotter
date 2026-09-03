import { afterEach, describe, expect, mock, test } from 'bun:test'
import { defaultLogger } from 'stenograph'
import type { CoreConfig } from '../../config'
import { probeAction } from './probeAction'

// Restored after every test: these suites share a process with others that do
// real fetches, and a leaked stub fails them somewhere else entirely.
const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

defaultLogger.disable()
const logger = defaultLogger.sub('test')

const config = (probeEndpoint: string) =>
  ({ probeEndpoint }) as unknown as CoreConfig

const request = (over: Record<string, unknown> = {}) =>
  ({
    source: 'frigate',
    label: 'person',
    frames: 30,
    score: 0.9,
    ...over,
  }) as never

describe('probeAction', () => {
  test('refuses when no probe is configured', async () => {
    // The production default, and the reason it has to be a clear refusal
    // rather than a silent no-op: the caller is waiting for an event.
    const outcome = await probeAction(config(''), request(), logger)

    expect(outcome.staged).toBe(false)
    expect(outcome).toMatchObject({
      // Показываем человеку, что делать, а не только что не так.
      reason: expect.stringContaining('--probe'),
    })
  })

  test('reports what it staged when the probe accepts', async () => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ ok: true, frames: 60 })),
    ) as unknown as typeof fetch

    const outcome = await probeAction(
      config('http://probe:8080'),
      request({ camera: 'front', frames: 60 }),
      logger,
    )

    expect(outcome).toEqual({ staged: true, camera: 'front', frames: 60 })
  })

  test('refuses when the probe cannot be reached', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('connection refused')
    }) as unknown as typeof fetch

    const outcome = await probeAction(
      config('http://probe:8080'),
      request(),
      logger,
    )

    expect(outcome.staged).toBe(false)
  })

  test('refuses a label the probe has no class id for', async () => {
    const fetchMock = mock(async () => new Response('{}'))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const outcome = await probeAction(
      config('http://probe:8080'),
      request({ label: 'dragon' }),
      logger,
    )

    expect(outcome.staged).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
