import { CommandGroup } from '@grammyjs/commands'
import type { BotContext } from '../context'
import { eventClearCommand } from './admin/eventClearCommand'
import { systemStatsCommand } from './admin/systemStatsCommand'
import { systemVersionCommand } from './admin/systemVersionCommand'
import { loginCommand } from './auth/loginCommand'
import { logoutCommand } from './auth/logoutCommand'
import { meCommand } from './auth/meCommand'
import { startCommand } from './general/startCommand'
import { cameraListCommand } from './nvr/cameraListCommand'
import { cameraSnapshotCommand } from './nvr/cameraSnapshotCommand'
import { testPublishCommand } from './test/testPublishCommand'
import { userSignCommand } from './user/userSignCommand'

export const generalCommands = new CommandGroup<BotContext>().add([
  startCommand,
])

export const anonymousCommands = new CommandGroup<BotContext>().add([
  loginCommand,
])

export const userCommands = new CommandGroup<BotContext>().add([
  logoutCommand,
  meCommand,
])

export const adminCommands = new CommandGroup<BotContext>().add([
  logoutCommand,
  meCommand,

  cameraListCommand,
  cameraSnapshotCommand,

  systemVersionCommand,
  systemStatsCommand,

  testPublishCommand,

  userSignCommand,

  eventClearCommand,
])

/*
  Base:
  /start

  Auth:
  [anonymous] /login
  [authorized] /logout
  [authorized] /me

  Deployment:
  /deployment_version

  Testing:
  /test_publish

  Users:
  /user_sign [user] - only for users role
  /user_revoke [user]
  /user_promote [user] [role]
  /user_demote [user] - set role to viewer

  Cameras:
  /camera_list
  /camera_snapshot [camera]

  Events:
  /event_clear
  /event_info [event]
* */

export const allCommands = new CommandGroup<BotContext>().add(
  [
    ...generalCommands.commands,
    ...anonymousCommands.commands,
    ...userCommands.commands,
    ...adminCommands.commands,
  ].filter((value, index, array) => array.indexOf(value) === index),
)
