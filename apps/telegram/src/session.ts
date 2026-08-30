import type { SpotterEvent } from '@spotter/transport'
import type { Role } from './db/schema'
import type { DialogState } from './dialog/types'

export type UserSession = {
  authorizedRole: Role | null | undefined
  recipientUuid: string | undefined
  needUpdateCommands: boolean
  dialog: DialogState | undefined
}

export type GlobalSession = {
  events: Record<string, SpotterEvent>
}

export type Session = {
  user: UserSession
  global: GlobalSession
}
