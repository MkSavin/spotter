/**
 * The install's identity and its bearer token.
 *
 * `deviceId` is generated once and outlives authorization, so redeeming a
 * second code upgrades this install rather than creating another one. The
 * token is what every API call presents; losing it means redeeming again.
 */
const DEVICE_KEY = 'spotter.deviceId'
const TOKEN_KEY = 'spotter.token'
const ROLE_KEY = 'spotter.role'

export type Role = 'VIEWER' | 'USER' | 'ADMIN'

const RANK: Record<Role, number> = { VIEWER: 1, USER: 2, ADMIN: 3 }

export const deviceId = (): string => {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

export const token = (): string | null => localStorage.getItem(TOKEN_KEY)

export const role = (): Role | null =>
  (localStorage.getItem(ROLE_KEY) as Role | null) ?? null

export const isAuthorized = (): boolean => !!token()

/** Whether the stored role is at least `required`. */
export const hasRole = (required: Role): boolean => {
  const held = role()
  return !!held && RANK[held] >= RANK[required]
}

export const remember = (value: { token: string; role: Role }): void => {
  localStorage.setItem(TOKEN_KEY, value.token)
  localStorage.setItem(ROLE_KEY, value.role)
}

/** Drops the grant, keeping `deviceId` so a re-redeem stays the same install. */
export const forget = (): void => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(ROLE_KEY)
}
