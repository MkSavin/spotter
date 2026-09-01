import type { BotContext } from '../context'
import { tgBindingsRepo, tgChatsRepo } from '../db/repository'
import type { Role } from '../db/schema'
import { roleTitle } from '../helpers/role'

/**
 * Shared flow for `/login` and the `/start` deep-link: sends `login.redeem`
 * to server, stores the tg_binding, updates session.
 */
export const loginWithCode = async (
  context: BotContext,
  code: string,
): Promise<void> => {
  const logger = context.logger.sub('auth')

  const from = context.from
  if (!from || !context.chatId) return

  const tgUserId = from.id.toString()
  const tgChatId = context.chatId.toString()

  let reply: Awaited<ReturnType<typeof context.commandBus.send>>

  try {
    reply = await context.commandBus.send('login.redeem', {
      code: code.trim(),
      tgUserId,
      tgChatId,
      username: from.username,
    })
  } catch {
    await context.reply('Сервис временно недоступен. Попробуйте позже.')
    return
  }

  if (!reply.ok) {
    const reason = reply.error
    const denial: Record<string, string> = {
      'username-mismatch': 'Этот код доступа предназначен другому пользователю',
      expired: 'Срок действия кода истёк — попросите администратора новый',
    }
    await context.reply((reason && denial[reason]) ?? 'Неверный код доступа')
    logger.sub(tgUserId).debug(`Failed to redeem access code (${reason})`)
    return
  }

  const data = reply.data as { recipientUuid: string; role: Role }
  const { recipientUuid, role } = data

  tgChatsRepo.upsert(context.db, tgChatId)
  tgBindingsRepo.upsert(context.db, {
    tgUserId,
    tgChatId,
    recipientUuid,
    username: from.username ?? null,
    role,
  })

  context.session.user.authorizedRole = role
  context.session.user.recipientUuid = recipientUuid
  context.session.user.needUpdateCommands = true

  logger.info(`User "${tgUserId}" authorized as ${role} via access code`)

  await context.replyWithHTML(
    `🎉 <b>Добро пожаловать, ${roleTitle(role)}!</b>

Чат и пользователь были успешно авторизованы!`,
  )

  await context.deleteMessage().catch(() => undefined)
}
