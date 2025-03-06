import { CommandGroup } from '@grammyjs/commands'
import type { Context } from '../context'
import { eventsClearCommand } from './admin/eventsClearCommand'
import { statsCommand } from './admin/statsCommand'
import { loginCommand } from './auth/loginCommand'
import { logoutCommand } from './auth/logoutCommand'
import { meCommand } from './auth/meCommand'
import { signCommand } from './auth/signCommand'
import { snapshotCommand } from './frigate/snapshotCommand'
import { startCommand } from './general/startCommand'
import { versionCommand } from './general/versionCommand'
import { testPublishCommand } from './testing/testPublishCommand'

export const anonymousCommands = new CommandGroup<Context>().add([
  startCommand,
  loginCommand,
])

export const userCommands = new CommandGroup<Context>().add([
  logoutCommand,
  meCommand,
  snapshotCommand,
])

export const adminCommands = new CommandGroup<Context>().add([
  versionCommand,
  signCommand,
  logoutCommand,
  meCommand,
  snapshotCommand,
  testPublishCommand,
  eventsClearCommand,
  statsCommand,
])

export const allCommands = new CommandGroup<Context>().add(
  [
    ...anonymousCommands.commands,
    ...userCommands.commands,
    ...adminCommands.commands,
  ].filter((value, index, array) => array.indexOf(value) === index),
)
