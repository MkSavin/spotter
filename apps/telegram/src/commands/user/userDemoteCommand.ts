import type { BotContext } from '../../context'
import { tgBindingsRepo } from '../../db/repository'
import { roleTitle } from '../../helpers/role'
import { askDomain } from '../framework/askDomain'
import { SpotterCommand } from '../framework/SpotterCommand'
import { userNotFound, userRefArg } from './userArgs'

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

    const reply = await askDomain(
      context,
      'user.setRole',
      { ref, role: 'VIEWER' },
      userNotFound(context, ref),
    )
    if (!reply) return

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
