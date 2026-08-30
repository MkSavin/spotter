import type { BotContext } from '../../context'
import { tgBindingsRepo } from '../../db/repository'
import { escapeHtml } from '../../helpers/html'
import { SpotterCommand } from '../framework/SpotterCommand'
import { userRefArg } from './userArgs'

class UserRevokeCommand extends SpotterCommand {
  readonly name = 'user_revoke'
  readonly description = 'Отозвать доступ пользователя'
  readonly access = 'ADMIN' as const

  readonly args = [userRefArg('👤 <b>Выберите пользователя</b>')]

  async handle(
    context: BotContext,
    args: Record<string, string>,
  ): Promise<void> {
    const ref = args.ref

    const binding = tgBindingsRepo.findByRef(context.db, ref)
    if (!binding) {
      await context.replyWithHTML(
        `🔍 <b>Пользователь <code>${escapeHtml(ref)}</code> не найден</b>`,
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
          `🔍 <b>Пользователь <code>${escapeHtml(ref)}</code> не найден</b>`,
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
