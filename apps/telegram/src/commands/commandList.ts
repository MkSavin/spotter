import { deploymentVersionCommand } from './admin/deploymentVersionCommand'
import { eventClearCommand } from './admin/eventClearCommand'
import { eventInfoCommand } from './admin/eventInfoCommand'
import { loginCommand } from './auth/loginCommand'
import { logoutCommand } from './auth/logoutCommand'
import { meCommand } from './auth/meCommand'
import type { SpotterCommand } from './framework/SpotterCommand'
import { startCommand } from './general/startCommand'
import { cameraListCommand } from './nvr/cameraListCommand'
import { cameraSnapshotCommand } from './nvr/cameraSnapshotCommand'
import { testPublishCommand } from './test/testPublishCommand'
import { userDemoteCommand } from './user/userDemoteCommand'
import { userPromoteCommand } from './user/userPromoteCommand'
import { userRevokeCommand } from './user/userRevokeCommand'
import { userSignCommand } from './user/userSignCommand'

export const commandRegistry: SpotterCommand[] = [
  startCommand,
  loginCommand,
  logoutCommand,
  meCommand,
  cameraListCommand,
  cameraSnapshotCommand,
  userSignCommand,
  userRevokeCommand,
  userPromoteCommand,
  userDemoteCommand,
  eventInfoCommand,
  eventClearCommand,
  deploymentVersionCommand,
  testPublishCommand,
]
