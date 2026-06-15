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

// Single source of truth: every command, ordered as it should appear in the
// menu. Access (and thus visibility) lives on each command via its `access`
// field — see commands/framework. Registration and the per-role menu are derived
// from this list (registerCommands / syncCommandMenu), nothing is duplicated.
export const commandRegistry: SpotterCommand[] = [
  // Base
  startCommand,

  // Auth
  loginCommand,
  logoutCommand,
  meCommand,

  // Cameras (user+)
  cameraListCommand,
  cameraSnapshotCommand,

  // Users (admin)
  userSignCommand,
  userRevokeCommand,
  userPromoteCommand,
  userDemoteCommand,

  // Events (admin)
  eventInfoCommand,
  eventClearCommand,

  // Deployment / testing (admin)
  deploymentVersionCommand,
  testPublishCommand,
]
