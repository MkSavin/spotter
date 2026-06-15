import type { BotContext } from '../../context'
import { chatsRepo, usersRepo } from '../../db/repository'
import { argument } from '../../middlewares/command/argument'
import { SpotterCommand } from '../framework/SpotterCommand'

class UserRevokeCommand extends SpotterCommand {
  readonly name = 'user_revoke'
  readonly description = 'Отозвать доступ пользователя'
  readonly access = 'ADMIN' as const

  protected readonly matcher = argument.string
  protected readonly signature = 'user_revoke [@username | id]'

  async handle(context: BotContext): Promise<void> {
    if (typeof context.match !== 'string') {
      return
    }

    const ref = context.match.trim()
    const user = usersRepo.findByRef(context.db, ref)

    if (!user) {
      await context.replyWithHTML(
        `🔍 <b>Пользователь <code>${ref}</code> не найден</b>`,
      )
      return
    }

    // Remove the user from every chat and drop those chats (stops notifications).
    const removed = usersRepo.removeById(context.db, user.id)
    for (const row of removed) {
      chatsRepo.remove(context.db, row.chatId)
    }

    context.logger
      .sub('auth')
      .info(`Access revoked for user "${user.id}" (${removed.length} chats)`)

    await context.replyWithHTML(
      `\u{26a0}\u{fe0f} <b>Доступ отозван</b>

Пользователь @${user.username ?? '—'} | #${user.id} деавторизован.`,
    )
  }
}

export const userRevokeCommand = new UserRevokeCommand()
