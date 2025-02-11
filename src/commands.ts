import { AuthorizeCommand } from './commands/AuthorizeCommand'
import { CommandRegistry } from './commands/CommandRegistry'
import { HelpCommand } from './commands/HelpCommand'
import { SnapshotCommand } from './commands/SnapshotCommand'
import { StartCommand } from './commands/StartCommand'
import { VersionCommand } from './commands/VersionCommand'
import type { ListenContext } from './index'

export const listenInput = (context: ListenContext): void => {
  new CommandRegistry(context, [
    StartCommand,
    HelpCommand,
    AuthorizeCommand,
    SnapshotCommand,
    VersionCommand,
  ]).listen()
}
