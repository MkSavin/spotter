import type { BotContext } from '../../context'
import { tgBindingsRepo } from '../../db/repository'
import { escapeHtml } from '../../helpers/html'
import { roleTitle } from '../../helpers/role'
import { SpotterCommand } from '../framework/SpotterCommand'
import { userRefArg } from './userArgs'

class UserDemoteCommand extends SpotterCommand {
  readonly name = 'user_demote'
  readonly description = 'Сбросить роль до наблюдателя'
  readonly access = 'ADMIN' as const

  readonly args = [userRefArg('👤 <b>Выберите пользователя</b>')]

  async handle(
    context: BotContext,
    args: Record<string, string>,
  ): Promise<void> {
    const ref = args.ref

    let reply: Awaited<ReturnType<typeof context.commandBus.send>>
    try {
      reply = await context.commandBus.send(
        'user.setRole',
        { ref, role: 'VIEWER' },
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

    const data = reply.data as { tgUserId?: string }
    const binding = data.tgUserId
      ? tgBindingsRepo.findByRef(context.db, data.tgUserId)
      : tgBindingsRepo.findByRef(context.db, ref)

    context.logger.sub('auth').info(`User "${ref}" demoted to VIEWER`)

    await context.replyWithHTML(
      `🔽 <b>Роль сброшена</b>

@${binding?.username ?? '—'} | #${data.tgUserId ?? '?'} теперь <b>${roleTitle('VIEWER')}</b>.`,
    )
  }
}

export const userDemoteCommand = new UserDemoteCommand()
