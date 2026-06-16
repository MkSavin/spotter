import { ROLES, type Role } from '../db/schema'

export const ROLE_TITLES: Record<Role, string> = {
  VIEWER: 'наблюдатель',
  USER: 'пользователь',
  ADMIN: 'администратор',
}

export const roleTitle = (role: Role): string => ROLE_TITLES[role]

export const parseRole = (value: string): Role | undefined => {
  const upper = value.trim().toUpperCase()
  return (ROLES as readonly string[]).includes(upper)
    ? (upper as Role)
    : undefined
}
