import type { Bot } from 'grammy'
import type { BotApi, BotContext } from '../../context'
import { isVisible } from './access'
import type { SpotterCommand } from './SpotterCommand'
import { suggest } from './suggest'

/**
 * Answers `/typo` instead of ignoring it. Registered last, so it only sees
 * commands no real handler claimed.
 */
export const registerUnknownCommand = (
  bot: Bot<BotContext, BotApi>,
  registry: SpotterCommand[],
): void => {
  bot
    .chatType('private')
    .on('message:entities:bot_command', async (context, next) => {
      const text = context.message.text ?? context.message.caption ?? ''
      // Only a command at the very start is an address to the bot.
      const typed = text.match(/^\/([A-Za-z0-9_]+)/)?.[1]?.toLowerCase()
      if (!typed) return next()

      // Handlers call next() after running, so a real command reaches this
      // point too — staying silent for it is what makes this the *unknown*
      // branch and not a second reply to every command.
      if (registry.some((command) => command.name === typed)) return next()

      // Suggest only what this user may run: the reply must not leak
      // the existence of commands their role cannot see.
      const role = context.session.user.authorizedRole
      const guess = suggest(
        typed,
        registry
          .filter((command) => isVisible(command.access, role))
          .map((command) => command.name),
      )

      context.logger.debug(`Unknown command /${typed}`)

      await context.reply(
        guess
          ? `Не знаю команду /${typed}. Возможно, вы имели в виду /${guess}?`
          : `Не знаю команду /${typed}. Список — в меню слева от поля ввода.`,
      )
    })
}
