import { ROLES, type Role } from '../db/schema'

/** Russian role titles for user-facing replies. */
export const ROLE_TITLES: Record<Role, string> = {
  VIEWER: 'наблюдатель',
  USER: 'пользователь',
  ADMIN: 'администратор',
}

export const roleTitle = (role: Role): string => ROLE_TITLES[role]

/** Parses a role from user input (case-insensitive), or undefined if unknown. */
export const parseRole = (value: string): Role | undefined => {
  const upper = value.trim().toUpperCase()
  return (ROLES as readonly string[]).includes(upper)
    ? (upper as Role)
    : undefined
}
