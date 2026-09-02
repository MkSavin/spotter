/**
 * The install's identity and its bearer token.
 *
 * `deviceId` is generated once and outlives authorization, so redeeming a
 * second code upgrades this install rather than creating another one. The
 * token is what every API call presents; losing it means redeeming again.
 */
import { log } from './log'

const DEVICE_KEY = 'spotter.deviceId'
const TOKEN_KEY = 'spotter.token'
const ROLE_KEY = 'spotter.role'

export type Role = 'VIEWER' | 'USER' | 'ADMIN'

const RANK: Record<Role, number> = { VIEWER: 1, USER: 2, ADMIN: 3 }

/**
 * Storage that degrades instead of throwing. Safari in private mode and any
 * browser with site data blocked raise on access rather than returning null,
 * and an unhandled throw here happens before the login request is ever sent —
 * the user sees "не удалось войти" with nothing in the network log.
 */
const memory = new Map<string, string>()

const readKey = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch (error) {
    log.warn('localStorage unreadable, using in-memory session', error)
    return memory.get(key) ?? null
  }
}

const writeKey = (key: string, value: string): void => {
  memory.set(key, value)
  try {
    localStorage.setItem(key, value)
  } catch (error) {
    // Not fatal: the session still works for this tab, it just will not survive
    // a reload. Failing the login over it would be worse.
    log.warn('localStorage unwritable, session is tab-only', error)
  }
}

const dropKey = (key: string): void => {
  memory.delete(key)
  try {
    localStorage.removeItem(key)
  } catch {
    // Nothing to do: the in-memory copy is already gone.
  }
}

/**
 * A random id without `crypto.randomUUID`, which exists only in a secure
 * context — over plain HTTP it is `undefined`, and calling it threw before the
 * request went out. Falls back to `getRandomValues`, then to `Math.random`.
 */
const randomId = (): string => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }

  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  ) {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    log.warn(
      'crypto.randomUUID unavailable (insecure context), using getRandomValues',
    )
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  }

  log.warn(
    'Web Crypto unavailable, falling back to Math.random for the device id',
  )
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('')
}

export const deviceId = (): string => {
  const existing = readKey(DEVICE_KEY)
  if (existing) return existing

  const id = randomId()
  writeKey(DEVICE_KEY, id)
  log.info('Device id minted', { id })
  return id
}

export const token = (): string | null => readKey(TOKEN_KEY)

export const role = (): Role | null =>
  (readKey(ROLE_KEY) as Role | null) ?? null

export const isAuthorized = (): boolean => !!token()

/** Whether the stored role is at least `required`. */
export const hasRole = (required: Role): boolean => {
  const held = role()
  return !!held && RANK[held] >= RANK[required]
}

export const remember = (value: { token: string; role: Role }): void => {
  writeKey(TOKEN_KEY, value.token)
  writeKey(ROLE_KEY, value.role)
  log.info('Session stored', { role: value.role })
}

/** Drops the grant, keeping `deviceId` so a re-redeem stays the same install. */
export const forget = (): void => {
  dropKey(TOKEN_KEY)
  dropKey(ROLE_KEY)
  log.info('Session dropped')
}
