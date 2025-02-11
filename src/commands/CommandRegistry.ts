import type { ListenContext } from '../index'
import type { User } from '../models'
import type {
  Command,
  CommandExecutionContext,
  CommandInitContext,
} from './Command'

export class CommandRegistry {
  list: Command[] = []

  context: ListenContext

  constructor(context: ListenContext, list: (typeof Command)[] = []) {
    this.context = context

    this.list = list.map((commandClass) => {
      const Class = commandClass as {
        new (context: CommandInitContext): Command
      }

      return new Class(this.context)
    })
  }

  listen(): void {
    const { bot } = this.context

    const users = this.context.loki.getCollection<User>('users')

    this.list.forEach((command) => {
      bot.onText(command.regexp, async (message, match) => {
        const chatId = message.chat.id

        const authorizedUser = users.findOne({
          chatId,
        })

        const executionContext: CommandExecutionContext = {
          ...this.context,

          commandRegistry: this,

          message,
          match,

          authorizedUser,
          chatId,
        }

        if (!(await command.authorize(executionContext))) {
          await bot.sendMessage(
            chatId,
            'У вас недостаточно прав для выполнения этой комманды',
            {
              parse_mode: 'HTML',
            },
          )
          return
        }

        if (!(await command.testArguments(executionContext))) {
          await bot.sendMessage(
            chatId,
            `Комманде были переданы неверные аргументы.\n\nПодсказка:\n/${command.signature} - ${command.description}`,
            {
              parse_mode: 'HTML',
            },
          )
          return
        }

        await command.execute(executionContext)
      })
    })
  }
}
