import type { Role } from '@prisma/client'
import type { SpotterEvent } from '@spotter/transport'

export type UserSession = {
  authorizedRole: Role | null | undefined
  needUpdateCommands: boolean
}

export type GlobalSession = {
  events: Record<string, SpotterEvent>
}

export type Session = {
  user: UserSession
  global: GlobalSession
}
