import { Command, type CommandExecutionContext } from './Command'

export class SnapshotCommand extends Command {
  signature = 'snapshot'
  description = 'Получить актуальный снимок с камеры'
  regexp = /\/(?:snapshot|shot) (\w+)/g

  async authorize(context: CommandExecutionContext): Promise<boolean> {
    return !!context.authorizedUser
  }

  async testArguments(context: CommandExecutionContext): Promise<boolean> {
    const { match } = context
    return !!match?.at(1)
  }

  execute(context: CommandExecutionContext): Promise<void> {
    throw new Error('Method not implemented.')
  }
}
