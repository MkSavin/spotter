import {
  Command,
  type CommandExecutionContext,
} from '../framework/commands/Command'

export class StartCommand extends Command {
  signature = 'start'
  description = 'Начать работу с ботом'
  regexp = /\/start/g

  async authorize(context: CommandExecutionContext): Promise<boolean> {
    return !context.authorizedUser
  }

  async execute(context: CommandExecutionContext): Promise<void> {
    const { bot, chatId } = context

    await bot.sendMessage(
      chatId,
      'Для того, чтобы начать работать с ботом, авторизуйтесь при помощи команды <code>/authorize</code>',
      {
        parse_mode: 'HTML',
      },
    )
  }
}
