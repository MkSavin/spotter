import { ROLE_RANK, type Role } from '../../db/schema'

/**
 * Declarative access requirement for a command: `all` (incl. anonymous),
 * `anonymous` (no role), `authorized` (any role) or a `Role` (that rank+).
 */
export type Access = 'all' | 'anonymous' | 'authorized' | Role

/** Current user's role, or null/undefined when anonymous. */
type CurrentRole = Role | null | undefined

const rankOf = (role: CurrentRole): number => (role ? ROLE_RANK[role] : 0)

/** Whether a user with the given role may execute a command of this access. */
export const canAccess = (access: Access, role: CurrentRole): boolean => {
  switch (access) {
    case 'all':
      return true
    case 'anonymous':
      return !role
    case 'authorized':
      return !!role
    default:
      return rankOf(role) >= ROLE_RANK[access]
  }
}

/** Whether a command should appear in the menu for the given role. */
export const isVisible = (access: Access, role: CurrentRole): boolean =>
  canAccess(access, role)

/** Russian explanation shown when access is denied. */
export const accessDenial = (access: Access): string => {
  switch (access) {
    case 'anonymous':
      return 'Эта команда доступна только неавторизованным пользователям'
    case 'authorized':
      return 'Эта команда доступна только авторизованным пользователям'
    case 'all':
      return 'Команда недоступна'
    case 'ADMIN':
      return 'Эта команда доступна только администраторам'
    case 'USER':
      return 'Эта команда доступна только пользователям и администраторам'
    default:
      return 'Эта команда доступна только авторизованным пользователям'
  }
}
