import Bun from 'bun'
import information from '../../package.json'
import { Command, type CommandExecutionContext } from './Command'

export class VersionCommand extends Command {
  signature = 'version'
  description = 'Версия бота'
  regexp = /\/version/g

  async authorize(context: CommandExecutionContext): Promise<boolean> {
    return !!context.authorizedUser
  }

  async execute(context: CommandExecutionContext): Promise<void> {
    const { bot, chatId } = context

    await bot.sendMessage(
      chatId,
      `Приложение: <code>${information.name} v${information.version}</code>\n` +
        `Платформа: <code>Bun ${Bun.version_with_sha}</code>\n`,
      {
        parse_mode: 'HTML',
      },
    )
  }
}
