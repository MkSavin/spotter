import { Command } from '@grammyjs/commands'
import type { BotContext } from '../../context'
import { guard } from '../../middlewares/command/guard'
import { sender } from '../../middlewares/command/sender'
import { commandScopes } from '../commandScopes'

export const logoutCommand = new Command<BotContext>(
  'logout',
  'Деавторизация из бота',
).addToScope(commandScopes.private, [
  guard('authorized'),
  sender('present'),
  async (context, next) => {
    const logger = context.logger.sub('auth')

    const from = context.from

    if (!from) {
      return
    }

    const chatId = context.chatId.toString()
    const userId = from.id.toString()

    const chat = await context.prisma.chat.delete({
      where: {
        id: chatId,
      },
    })

    logger.info(`Chat "${chat.id}" has successfully been unauthorized`)

    const user = await context.prisma.user.delete({
      where: {
        id: userId,
        chat_id: chatId,
      },
    })

    logger.info(`User "${user.id}" has successfully been unauthorized`)

    context.session.needUpdateCommands = true

    await context.replyWithHTML(
      `👋 <b>Еще увидимся!</b>

Чат и пользователь были успешно деавторизованы!`,
    )

    context.auth = null

    return next()
  },
])
