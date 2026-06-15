import type { BotContext } from '../context'
import { roleTitle } from '../helpers/role'
import { redeemToken } from './token'

// Shared login flow for /login and the /start deep-link: redeems a code, updates
// the session, greets the user and removes the message carrying the code.
export const loginWithCode = async (
  context: BotContext,
  code: string,
): Promise<void> => {
  const logger = context.logger.sub('auth')

  const from = context.from
  if (!from || !context.chatId) {
    return
  }

  const result = redeemToken(context.db, code, {
    userId: from.id.toString(),
    chatId: context.chatId.toString(),
    username: from.username,
  })

  if (!result.ok) {
    await context.reply(
      result.reason === 'username-mismatch'
        ? 'Этот код доступа предназначен другому пользователю'
        : 'Неверный код доступа',
    )
    logger
      .sub(from.id.toString())
      .debug(`Failed to redeem access code (${result.reason})`)
    return
  }

  context.session.user.authorizedRole = result.role
  context.session.user.needUpdateCommands = true

  logger.info(
    `User "${result.user.id}" authorized as ${result.role} via access code`,
  )

  await context.replyWithHTML(
    `🎉 <b>Добро пожаловать, ${roleTitle(result.role)}!</b>

Чат и пользователь были успешно авторизованы!`,
  )

  // Best-effort: hide the code the user just sent.
  await context.deleteMessage().catch(() => undefined)
}
