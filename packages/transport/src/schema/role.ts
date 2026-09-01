/**
 * The role vocabulary, shared by everything that has to reason about access.
 *
 * The domain owns the meaning and enforces it on every command; the frontends
 * need the same names and ordering to decide what to offer, so the definition
 * lives here rather than being restated per service.
 */
export const ROLES = ['VIEWER', 'USER', 'ADMIN'] as const

export type Role = (typeof ROLES)[number]

/** Enum-style accessor, so call sites read `Role.ADMIN` rather than a literal. */
export const Role = {
  VIEWER: 'VIEWER',
  USER: 'USER',
  ADMIN: 'ADMIN',
} as const satisfies Record<Role, Role>

export const ROLE_RANK: Record<Role, number> = {
  VIEWER: 1,
  USER: 2,
  ADMIN: 3,
}

/** What a route or command demands of its caller. */
export type Requirement = 'anonymous' | 'authorized' | Role

export const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value)

/** Parses user input (any case) into a role; `undefined` when it is not one. */
export const parseRole = (value: string): Role | undefined => {
  const upper = value.trim().toUpperCase()
  return isRole(upper) ? upper : undefined
}

/** Whether `role` (absent when unauthorized) satisfies `requirement`. */
export const satisfies = (
  requirement: Requirement,
  role: Role | null | undefined,
): boolean => {
  switch (requirement) {
    case 'anonymous':
      return !role
    case 'authorized':
      return !!role
    default:
      return !!role && ROLE_RANK[role] >= ROLE_RANK[requirement]
  }
}
