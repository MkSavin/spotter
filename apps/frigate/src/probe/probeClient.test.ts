import { afterEach, describe, expect, mock, test } from 'bun:test'
import { defaultLogger } from 'stenograph'
import { armProbe, probeClassId } from './probeClient'

// Restored after every test: these suites share a process with others that do
// real fetches, and a leaked stub fails them somewhere else entirely.
const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

defaultLogger.disable()
const logger = defaultLogger.sub('test')

const okResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 })

describe('probeClassId', () => {
  test('maps a label the NVR config knows', () => {
    expect(probeClassId('person')).toBe(0)
    expect(probeClassId('car')).toBe(1)
  })

  test('refuses an unknown label rather than guessing', () => {
    // Guessing would stage the wrong object and the test would still "pass".
    expect(probeClassId('dragon')).toBeNull()
  })
})

describe('armProbe', () => {
  test('sends the class id, score and frame count', async () => {
    let sent: Record<string, unknown> = {}
    const fetchMock = mock(async (_url: string, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body))
      return okResponse({ ok: true, frames: 42 })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await armProbe(
      'http://probe:8080',
      { label: 'car', frames: 42, score: 0.7 },
      logger,
    )

    expect(result).toEqual({ ok: true, frames: 42 })
    expect(sent).toEqual({ class_id: 1, score: 0.7, frames: 42 })
  })

  test('tolerates a trailing slash in the endpoint', async () => {
    let url = ''
    globalThis.fetch = mock(async (target: string) => {
      url = target
      return okResponse({ ok: true, frames: 1 })
    }) as unknown as typeof fetch

    await armProbe(
      'http://probe:8080/',
      { label: 'person', frames: 1, score: 0.9 },
      logger,
    )

    expect(url).toBe('http://probe:8080/detect')
  })

  test('returns null on an unknown label without calling out', async () => {
    const fetchMock = mock(async () => okResponse({ ok: true, frames: 1 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await armProbe(
      'http://probe:8080',
      { label: 'dragon', frames: 30, score: 0.9 },
      logger,
    )

    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('returns null when the probe answers with an error', async () => {
    globalThis.fetch = mock(
      async () => new Response('nope', { status: 500 }),
    ) as unknown as typeof fetch

    expect(
      await armProbe(
        'http://probe:8080',
        { label: 'person', frames: 30, score: 0.9 },
        logger,
      ),
    ).toBeNull()
  })

  test('returns null when the probe is not running', async () => {
    // The common case in production, where the profile is off by design.
    globalThis.fetch = mock(async () => {
      throw new Error('connection refused')
    }) as unknown as typeof fetch

    expect(
      await armProbe(
        'http://probe:8080',
        { label: 'person', frames: 30, score: 0.9 },
        logger,
      ),
    ).toBeNull()
  })
})
