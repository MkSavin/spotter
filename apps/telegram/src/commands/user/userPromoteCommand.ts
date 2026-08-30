import type { BotContext } from '../../context'
import { tgBindingsRepo } from '../../db/repository'
import { escapeHtml } from '../../helpers/html'
import { type Role, roleTitle } from '../../helpers/role'
import { SpotterCommand } from '../framework/SpotterCommand'
import { roleArg, userRefArg } from './userArgs'

class UserPromoteCommand extends SpotterCommand {
  readonly name = 'user_promote'
  readonly description = 'Изменить роль пользователя'
  readonly access = 'ADMIN' as const

  readonly args = [userRefArg('👤 <b>Выберите пользователя</b>'), roleArg]

  async handle(
    context: BotContext,
    args: Record<string, string>,
  ): Promise<void> {
    const ref = args.ref
    const role = args.role as Role

    let reply: Awaited<ReturnType<typeof context.commandBus.send>>
    try {
      reply = await context.commandBus.send(
        'user.setRole',
        { ref, role },
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

    const data = reply.data as { tgUserId?: string; newRole: string }
    const binding = data.tgUserId
      ? tgBindingsRepo.findByRef(context.db, data.tgUserId)
      : tgBindingsRepo.findByRef(context.db, ref)

    context.logger.sub('auth').info(`Role changed: ${ref} → ${role}`)

    await context.replyWithHTML(
      `🆙 <b>Роль обновлена</b>

@${binding?.username ?? '—'} | #${data.tgUserId ?? '?'} теперь <b>${roleTitle(role)}</b>.`,
    )
  }
}

export const userPromoteCommand = new UserPromoteCommand()
