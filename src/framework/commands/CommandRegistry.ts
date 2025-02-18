import type { ListenContext } from '../../index'
import type { User } from '../../models'
import { FrigateAPI } from '../api/FrigateAPI'
import type {
  Command,
  CommandExecutionContext,
  CommandInitContext,
} from './Command'

export class CommandRegistry {
  static instance: CommandRegistry = new CommandRegistry()

  private commandClasses: (typeof Command)[] = []
  private commandInstances: Command[] = []

  public get commands(): Command[] {
    return this.commandInstances
  }

  public enrich(classes: (typeof Command)[]): void {
    this.commandClasses = classes
  }

  public register(commandClass: typeof Command): void {
    this.commandClasses.push(commandClass)
  }

  public listen(context: ListenContext): void {
    const { bot, loki } = context

    this.commandInstances = this.commandClasses.map((commandClass) => {
      const Class = commandClass as {
        new (context: CommandInitContext): Command
      }

      return new Class(context)
    })

    const users = loki.getCollection<User>('users')

    for (const command of this.commandInstances) {
      bot.onText(command.regexp, async (message, match) => {
        const chatId = message.chat.id

        const authorizedUser = users.findOne({
          chatId,
        })

        const api = new FrigateAPI(command.logger)

        const executionContext: CommandExecutionContext = {
          ...context,

          api,
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
    }
  }
}
