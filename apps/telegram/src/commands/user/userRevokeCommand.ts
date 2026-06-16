import type { BotContext } from '../../context'
import { tgBindingsRepo } from '../../db/repository'
import { argument } from '../../middlewares/command/argument'
import { SpotterCommand } from '../framework/SpotterCommand'

class UserRevokeCommand extends SpotterCommand {
  readonly name = 'user_revoke'
  readonly description = 'Отозвать доступ пользователя'
  readonly access = 'ADMIN' as const

  protected readonly matcher = argument.string
  protected readonly signature = 'user_revoke [@username | id]'

  async handle(context: BotContext): Promise<void> {
    if (typeof context.match !== 'string') return

    const ref = context.match.trim()

    const binding = tgBindingsRepo.findByRef(context.db, ref)
    if (!binding) {
      await context.replyWithHTML(
        `🔍 <b>Пользователь <code>${ref}</code> не найден</b>`,
      )
      return
    }

    let reply: Awaited<ReturnType<typeof context.commandBus.send>>
    try {
      reply = await context.commandBus.send(
        'user.revoke',
        { ref },
        context.session.user.recipientUuid,
      )
    } catch {
      await context.reply('Сервис временно недоступен.')
      return
    }

    if (!reply.ok) {
      if (reply.error === 'not-found') {
        await context.replyWithHTML(
          `🔍 <b>Пользователь <code>${ref}</code> не найден</b>`,
        )
      } else {
        await context.reply(`Ошибка: ${reply.error}`)
      }
      return
    }

    context.logger
      .sub('auth')
      .info(`Access revoked: ${ref} (recipientUuid: ${binding.recipientUuid})`)

    await context.replyWithHTML(
      `\u{26a0}\u{fe0f} <b>Доступ отозван</b>

Пользователь @${binding.username ?? '—'} | #${binding.tgUserId} деавторизован.`,
    )
  }
}

export const userRevokeCommand = new UserRevokeCommand()
