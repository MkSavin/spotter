import { Command, type CommandExecutionContext } from './Command'

export class HelpCommand extends Command {
  signature = 'help'
  description = 'Помощь по коммандам'
  regexp = /\/(?:help|h)/g

  async execute(context: CommandExecutionContext): Promise<void> {
    const { bot, chatId, commandRegistry } = context

    const description = (
      await Promise.all(
        commandRegistry.list.map(async (command) => ({
          command,
          filter: await command.authorize(context),
        })),
      )
    )
      .filter(({ filter }) => filter)
      .map(({ command }) => `/${command.signature} - ${command.description}`)
      .join('\n')

    await bot.sendMessage(
      chatId,
      `<b>Список доступных комманд:</b>\n${description}`,
      {
        parse_mode: 'HTML',
      },
    )
  }
}
