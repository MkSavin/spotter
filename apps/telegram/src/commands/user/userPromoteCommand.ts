import type { BotContext } from '../../context'
import { tgBindingsRepo } from '../../db/repository'
import { type Role, roleTitle } from '../../helpers/role'
import { askDomain } from '../framework/askDomain'
import { SpotterCommand } from '../framework/SpotterCommand'
import { roleArg, userNotFound, userRefArg } from './userArgs'

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

    const reply = await askDomain(
      context,
      'user.setRole',
      { ref, role },
      userNotFound(context, ref),
    )
    if (!reply) return

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
