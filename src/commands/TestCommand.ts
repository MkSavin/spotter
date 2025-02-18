import {
  Command,
  type CommandExecutionContext,
} from '../framework/commands/Command'

export class TestCommand extends Command {
  signature = 'test'
  description = 'Тестовая команда'
  regexp = /\/test/g

  async authorize(context: CommandExecutionContext): Promise<boolean> {
    return !!context.authorizedUser
  }

  async execute(context: CommandExecutionContext): Promise<void> {
    const { bot, chatId, message } = context

    await bot.sendMessage(chatId, 'Тест тест тест', {
      parse_mode: 'HTML',
      reply_to_message_id: message.message_id,
      reply_markup: {
        keyboard: [[{ text: 'Сделать снимок' }]],
        one_time_keyboard: false,
        resize_keyboard: true,
      },
    })
  }
}
