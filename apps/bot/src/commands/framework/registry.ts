import type { Bot } from 'grammy'
import type { Middleware } from 'grammy'
import type { BotApi, BotContext } from '../../context'
import type { SpotterCommand } from './SpotterCommand'
import { isVisible } from './access'

// Registers every command's handler on the bot. Commands only fire in private
// chats (operator commands), matching the previous `addToScope(private)` setup.
export const registerCommands = (
  bot: Bot<BotContext, BotApi>,
  registry: SpotterCommand[],
): void => {
  const privateChats = bot.chatType('private')

  for (const command of registry) {
    privateChats.command(command.name, ...command.middlewares())
  }
}

// Rebuilds the per-chat command menu on the fly whenever the cached role changes
// (`needUpdateCommands`). Replaces the old switchCommandList middleware: the
// visible set is derived from the registry by access, not hardcoded packs.
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
