import { ROLE_RANK, type Role } from '../../db/schema'

// Declarative access requirement for a command.
// - 'all'        — everyone, including anonymous (e.g. /start)
// - 'anonymous'  — only users without a role (e.g. /login)
// - 'authorized' — any user with a role (viewer/user/admin)
// - Role         — that role or higher (by ROLE_RANK)
export type Access = 'all' | 'anonymous' | 'authorized' | Role

// The current user's role, or null/undefined when anonymous.
type CurrentRole = Role | null | undefined

const rankOf = (role: CurrentRole): number => (role ? ROLE_RANK[role] : 0)

// Whether a user with the given role may execute a command with this access.
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

// Whether a command should appear in the menu for a user with the given role.
// Same as canAccess, kept separate to make the menu/handler split explicit.
export const isVisible = (access: Access, role: CurrentRole): boolean =>
  canAccess(access, role)

// Human-readable explanation used when access is denied.
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
