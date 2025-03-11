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
])

export const adminCommands = new CommandGroup<Context>().add([
  logoutCommand,
  meCommand,
  snapshotCommand,
  versionCommand,
  signCommand,
  testPublishCommand,
  eventsClearCommand,
  statsCommand,
])

/*
  Base:
  [anonymous] /start

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

export const allCommands = new CommandGroup<Context>().add(
  [
    ...anonymousCommands.commands,
    ...userCommands.commands,
    ...adminCommands.commands,
  ].filter((value, index, array) => array.indexOf(value) === index),
)
