import { ROLE_RANK, type Role } from '../../db/schema'

export type Access = 'all' | 'anonymous' | 'authorized' | Role

type CurrentRole = Role | null | undefined

const rankOf = (role: CurrentRole): number => (role ? ROLE_RANK[role] : 0)

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

export const isVisible = (access: Access, role: CurrentRole): boolean =>
  canAccess(access, role)

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
