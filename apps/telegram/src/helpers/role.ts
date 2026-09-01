import type { Role } from '../db/schema'

export type { Role }

/** Russian role names for the bot's UI; the vocabulary itself lives in transport. */
export const ROLE_TITLES: Record<Role, string> = {
  VIEWER: 'наблюдатель',
  USER: 'пользователь',
  ADMIN: 'администратор',
}

export const roleTitle = (role: Role): string => ROLE_TITLES[role]
