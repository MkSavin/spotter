import { type Requirement, satisfies } from '@spotter/transport'
import type { Role } from '../../db/schema'

/** `Requirement` plus `all`, which the bot uses for always-visible commands. */
export type Access = 'all' | Requirement

type CurrentRole = Role | null | undefined

export const canAccess = (access: Access, role: CurrentRole): boolean =>
  access === 'all' ? true : satisfies(access, role)

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
