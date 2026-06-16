import type { SpotterEvent } from '@spotter/transport'
import type { Role } from './db/schema'

export type UserSession = {
  authorizedRole: Role | null | undefined
  recipientUuid: string | undefined
  needUpdateCommands: boolean
}

export type GlobalSession = {
  events: Record<string, SpotterEvent>
}

export type Session = {
  user: UserSession
  global: GlobalSession
}
