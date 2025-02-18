import { AuthorizeCommand } from './AuthorizeCommand'
import { HelpCommand } from './HelpCommand'
import { SnapshotCommand } from './SnapshotCommand'
import { StartCommand } from './StartCommand'
import { VersionCommand } from './VersionCommand'

export const providedCommands = [
  AuthorizeCommand,
  HelpCommand,
  SnapshotCommand,
  StartCommand,
  VersionCommand,
  // TestCommand,
]
