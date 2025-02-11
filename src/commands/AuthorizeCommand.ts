import process from 'node:process'
import type { User } from '../models'
import {
  Command,
  type CommandExecutionContext,
  type CommandInitContext,
} from './Command'

export class AuthorizeCommand extends Command {
  signature = 'auth [password]'
  description = 'Авторизоваться в боте'
  regexp = /\/auth (\w+)/g

  users: Collection<User>

  constructor(context: CommandInitContext) {
    super(context)

    this.logger = this.logger.sub('auth')
    this.users = context.loki.getCollection<User>('users')

    if (!this.users) {
      throw new Error('Database error. Users collection not found')
    }
  }

  async authorize(context: CommandExecutionContext): Promise<boolean> {
    return !context.authorizedUser && !!context.message.from
  }

  async testArguments(context: CommandExecutionContext): Promise<boolean> {
    const { match } = context
    return !!match?.at(1)
  }

  async execute(context: CommandExecutionContext): Promise<void> {
    const {
      bot,
      message: { from: user },
      chatId,
      match,
    } = context

    if (!user) {
      return
    }

    this.logger = this.logger.sub(`${user.id}`)

    const passwordRequired = process.env.AUTH_SECRET?.trim()
    const passwordInput = match?.at(1)?.trim()

    this.logger.debug('New log in attempt')

    if (!user) {
      this.logger.debug('Log in attempt is aborted due to empty user data')
      await bot.sendMessage(chatId, 'Информация о пользователе не найдена')
      return
    }

    if (passwordInput !== passwordRequired) {
      this.logger.debug('User entered wrong password')
      await bot.sendMessage(chatId, 'Введен неверный пароль')
      return
    }

    this.users.insert({
      ...user,
      chatId,
    })

    this.logger.info('User is successfully registered and logged in')

    await bot.sendMessage(
      chatId,
      'Вы успешно зарегистрировались в системе удаленного видеонаблюдения',
    )
  }
}
