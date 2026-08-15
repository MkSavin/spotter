import type { Bot, Middleware } from 'grammy'
import type { BotApi, BotContext } from '../../context'
import { isVisible } from './access'
import type { SpotterCommand } from './SpotterCommand'

export const registerCommands = (
  bot: Bot<BotContext, BotApi>,
  registry: SpotterCommand[],
): void => {
  const privateChats = bot.chatType('private')
  for (const command of registry) {
    privateChats.command(command.name, ...command.middlewares())
  }
}

export const syncCommandMenu =
  (registry: SpotterCommand[]): Middleware<BotContext> =>
  async (context, next) => {
    if (!context.session.user.needUpdateCommands || !context.chatId) {
      return next()
    }

    const role = context.session.user.authorizedRole

    const list = registry
      .filter((command) => isVisible(command.access, role))
      .map((command) => command.toBotCommand())

    context.session.user.needUpdateCommands = false

    await context.api.setMyCommands(list, {
      scope: { type: 'chat', chat_id: context.chatId },
    })

    context.logger.debug(
      `Command menu rebuilt for role ${role ?? 'anonymous'} (${list.length} commands)`,
    )

    return next()
  }
