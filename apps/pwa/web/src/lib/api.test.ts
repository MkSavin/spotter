import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { ApiError, api } from './api'

const g = globalThis as Record<string, unknown>
let savedFetch: unknown
let savedStorage: unknown
let calls: Array<{ path: string; init?: RequestInit }>

const respondWith = (status: number, body: unknown) => {
  g.fetch = (path: string, init?: RequestInit) => {
    calls.push({ path, init })
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }
}

beforeEach(() => {
  calls = []
  savedFetch = g.fetch
  savedStorage = g.localStorage
  const store = new Map<string, string>()
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
  }
  g.window = { __spotterDebug: false }
  console.warn = () => {}
  console.error = () => {}
})

afterEach(() => {
  g.fetch = savedFetch
  g.localStorage = savedStorage
})

describe('api.authorize', () => {
  test('шлёт код и deviceId на /api/auth', async () => {
    respondWith(200, { ok: true, token: 'tok', role: 'VIEWER' })

    const result = await api.authorize('device-12345678', 'code-abc', 'iPhone')

    expect(result.token).toBe('tok')
    expect(calls[0].path).toBe('/api/auth')
    expect(calls[0].init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      deviceId: 'device-12345678',
      code: 'code-abc',
      label: 'iPhone',
    })
  })

  test('ставит content-type, иначе сервер не разберёт тело', async () => {
    respondWith(200, { ok: true, token: 'tok', role: 'VIEWER' })

    await api.authorize('device-12345678', 'code-abc')

    const headers = calls[0].init?.headers as Record<string, string>
    expect(headers['content-type']).toBe('application/json')
  })

  test('401 приходит как ApiError с причиной от домена', async () => {
    respondWith(401, { ok: false, error: 'expired' })

    const caught = await api
      .authorize('device-12345678', 'stale')
      .catch((error: unknown) => error)

    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).status).toBe(401)
    // The reason must survive: "expired" and "not-found" need different advice.
    expect((caught as ApiError).message).toBe('expired')
  })

  test('503 отличается от отказа по коду', async () => {
    respondWith(503, { ok: false, error: 'unavailable' })

    const caught = await api
      .authorize('device-12345678', 'code')
      .catch((error: unknown) => error)

    expect((caught as ApiError).status).toBe(503)
  })

  test('сетевой сбой пробрасывается, а не превращается в ApiError', async () => {
    g.fetch = () => Promise.reject(new TypeError('Failed to fetch'))

    const caught = await api
      .authorize('device-12345678', 'code')
      .catch((error: unknown) => error)

    expect(caught).toBeInstanceOf(TypeError)
    expect(caught).not.toBeInstanceOf(ApiError)
  })
})

describe('авторизованные запросы', () => {
  test('без токена заголовок Authorization не ставится', async () => {
    respondWith(200, { events: [] })

    await api.events()

    const headers = calls[0].init?.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  test('401 на обычном запросе стирает грант', async () => {
    respondWith(200, { ok: true, token: 'tok', role: 'VIEWER' })
    await api.authorize('device-12345678', 'code')

    respondWith(401, { error: 'unauthorized' })
    await api.events().catch(() => undefined)

    // The stored token is gone, so the app returns to the code screen instead
    // of retrying forever with a grant the server no longer honours.
    respondWith(200, { events: [] })
    await api.events()
    const headers = calls.at(-1)?.init?.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })
})
