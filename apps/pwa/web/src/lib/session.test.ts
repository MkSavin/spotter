import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

/** A localStorage that behaves like a real one, or refuses like a blocked one. */
const makeStorage = (mode: 'ok' | 'throws' = 'ok') => {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => {
      if (mode === 'throws') throw new DOMException('denied', 'SecurityError')
      return store.get(key) ?? null
    },
    setItem: (key: string, value: string) => {
      if (mode === 'throws') throw new DOMException('denied', 'SecurityError')
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      if (mode === 'throws') throw new DOMException('denied', 'SecurityError')
      store.delete(key)
    },
    size: () => store.size,
  }
}

// The hardened paths log a warning by design; keep the run readable.
const quietConsole = () => {
  const warn = console.warn
  console.warn = () => {}
  return () => {
    console.warn = warn
  }
}

const g = globalThis as Record<string, unknown>
let savedCrypto: unknown
let savedStorage: unknown
let savedWindow: unknown

// Imported fresh per test: the module keeps an in-memory fallback of its own.
const loadSession = async () => {
  const path = `./session.ts?v=${Math.random()}`
  return (await import(path)) as typeof import('./session')
}

let restoreConsole: () => void

beforeEach(() => {
  restoreConsole = quietConsole()
  savedCrypto = g.crypto
  savedStorage = g.localStorage
  savedWindow = g.window
  g.window = { __spotterDebug: false }
})

afterEach(() => {
  restoreConsole()
  g.crypto = savedCrypto
  g.localStorage = savedStorage
  g.window = savedWindow
})

describe('deviceId', () => {
  test('использует crypto.randomUUID, когда он есть', async () => {
    g.localStorage = makeStorage()
    g.crypto = { randomUUID: () => 'uuid-from-web-crypto' }

    const { deviceId } = await loadSession()
    expect(deviceId()).toBe('uuid-from-web-crypto')
  })

  test('без randomUUID (страница по HTTP) не бросает, а берёт getRandomValues', async () => {
    g.localStorage = makeStorage()
    // Exactly what a browser exposes over plain HTTP: no randomUUID.
    g.crypto = {
      getRandomValues: (array: Uint8Array) => {
        array.fill(0xab)
        return array
      },
    }

    const { deviceId } = await loadSession()
    const id = deviceId()

    expect(id).toBe('ab'.repeat(16))
    expect(id.length).toBeGreaterThanOrEqual(8)
  })

  test('совсем без Web Crypto всё равно выдаёт пригодный id', async () => {
    g.localStorage = makeStorage()
    g.crypto = undefined

    const { deviceId } = await loadSession()
    const id = deviceId()

    // The API demands at least 8 characters; anything shorter fails validation.
    expect(id.length).toBeGreaterThanOrEqual(8)
    expect(id).toMatch(/^[0-9a-f]+$/)
  })

  test('id стабилен между вызовами', async () => {
    g.localStorage = makeStorage()
    g.crypto = { randomUUID: () => `uuid-${Math.random()}` }

    const { deviceId } = await loadSession()
    expect(deviceId()).toBe(deviceId())
  })

  test('заблокированное хранилище не роняет вход', async () => {
    g.localStorage = makeStorage('throws')
    g.crypto = { randomUUID: () => 'uuid-1' }

    const { deviceId } = await loadSession()
    const id = deviceId()

    expect(id).toBe('uuid-1')
    // Falls back to memory, so the id still survives within the page.
    expect(deviceId()).toBe('uuid-1')
  })
})

describe('токен и роль', () => {
  test('remember/forget проходят полный цикл', async () => {
    g.localStorage = makeStorage()
    g.crypto = { randomUUID: () => 'uuid-1' }

    const { remember, forget, token, role, isAuthorized } = await loadSession()

    expect(isAuthorized()).toBe(false)
    remember({ token: 'tok-1', role: 'ADMIN' })
    expect(token()).toBe('tok-1')
    expect(role()).toBe('ADMIN')
    expect(isAuthorized()).toBe(true)

    forget()
    expect(token()).toBeNull()
    expect(isAuthorized()).toBe(false)
  })

  test('forget сохраняет deviceId, чтобы повторный вход был тем же устройством', async () => {
    g.localStorage = makeStorage()
    g.crypto = { randomUUID: () => 'uuid-stable' }

    const { deviceId, remember, forget } = await loadSession()
    const before = deviceId()
    remember({ token: 'tok', role: 'VIEWER' })
    forget()

    expect(deviceId()).toBe(before)
  })

  test('hasRole сравнивает по рангу, а не по равенству', async () => {
    g.localStorage = makeStorage()
    g.crypto = { randomUUID: () => 'uuid-1' }

    const { remember, hasRole } = await loadSession()
    remember({ token: 'tok', role: 'USER' })

    expect(hasRole('VIEWER')).toBe(true)
    expect(hasRole('USER')).toBe(true)
    expect(hasRole('ADMIN')).toBe(false)
  })

  test('хранилище заблокировано — сессия живёт в памяти', async () => {
    g.localStorage = makeStorage('throws')
    g.crypto = { randomUUID: () => 'uuid-1' }

    const { remember, token, isAuthorized } = await loadSession()
    remember({ token: 'tok-mem', role: 'VIEWER' })

    expect(token()).toBe('tok-mem')
    expect(isAuthorized()).toBe(true)
  })
})
