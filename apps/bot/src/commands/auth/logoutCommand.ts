import type { BotContext } from '../../context'
import { chatsRepo, usersRepo } from '../../db/repository'
import { SpotterCommand } from '../framework/SpotterCommand'

class LogoutCommand extends SpotterCommand {
  readonly name = 'logout'
  readonly description = 'Деавторизация из бота'
  readonly access = 'authorized' as const

  async handle(context: BotContext): Promise<void> {
    const logger = context.logger.sub('auth')

    const from = context.from
    if (!from || !context.chatId) {
      return
    }

    const chatId = context.chatId.toString()
    const userId = from.id.toString()

    const chat = chatsRepo.remove(context.db, chatId)
    logger.info(`Chat "${chat?.id}" has successfully been unauthorized`)

    const user = usersRepo.remove(context.db, userId, chatId)
    logger.info(`User "${user?.id}" has successfully been unauthorized`)

    context.session.user.needUpdateCommands = true
    context.session.user.authorizedRole = null

    await context.replyWithHTML(
      `👋 <b>Еще увидимся!</b>

Чат и пользователь были успешно деавторизованы!`,
    )
  }
}

export const logoutCommand = new LogoutCommand()
