import type { BotContext } from '../../context'
import { tgBindingsRepo, tgChatsRepo } from '../../db/repository'
import { SpotterCommand } from '../framework/SpotterCommand'

class LogoutCommand extends SpotterCommand {
  readonly name = 'logout'
  readonly description = 'Деавторизация из бота'
  readonly access = 'authorized' as const

  async handle(context: BotContext): Promise<void> {
    const logger = context.logger.sub('auth')

    const from = context.from
    if (!from || !context.chatId) return

    const tgChatId = context.chatId.toString()
    const tgUserId = from.id.toString()

    tgBindingsRepo.remove(context.db, tgUserId, tgChatId)
    tgChatsRepo.remove(context.db, tgChatId)

    logger.info(`User "${tgUserId}" logged out from chat "${tgChatId}"`)

    context.session.user.needUpdateCommands = true
    context.session.user.authorizedRole = null
    context.session.user.recipientUuid = undefined

    await context.replyWithHTML(
      `👋 <b>Еще увидимся!</b>

Чат и пользователь были успешно деавторизованы!`,
    )
  }
}

export const logoutCommand = new LogoutCommand()
