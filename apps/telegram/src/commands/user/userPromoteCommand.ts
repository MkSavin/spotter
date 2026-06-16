import type { BotContext } from '../../context'
import { tgBindingsRepo } from '../../db/repository'
import { parseRole, roleTitle } from '../../helpers/role'
import { argument } from '../../middlewares/command/argument'
import { SpotterCommand } from '../framework/SpotterCommand'

class UserPromoteCommand extends SpotterCommand {
  readonly name = 'user_promote'
  readonly description = 'Изменить роль пользователя'
  readonly access = 'ADMIN' as const

  protected readonly matcher = argument.string
  protected readonly signature =
    'user_promote [@username | id] [viewer|user|admin]'

  async handle(context: BotContext): Promise<void> {
    if (typeof context.match !== 'string') return

    const [ref, roleArg] = context.match.trim().split(/\s+/)
    const role = roleArg ? parseRole(roleArg) : undefined

    if (!ref || !role) {
      await context.replyWithHTML(
        `<b>Неверный список аргументов команды!</b>
Сигнатура команды: <code>${this.signature}</code>`,
      )
      return
    }

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
          `🔍 <b>Пользователь <code>${ref}</code> не найден</b>`,
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
