import type { BotContext } from '../../context'
import { usersRepo } from '../../db/repository'
import { Role } from '../../db/schema'
import { roleTitle } from '../../helpers/role'
import { argument } from '../../middlewares/command/argument'
import { SpotterCommand } from '../framework/SpotterCommand'

class UserDemoteCommand extends SpotterCommand {
  readonly name = 'user_demote'
  readonly description = 'Сбросить роль до наблюдателя'
  readonly access = 'ADMIN' as const

  protected readonly matcher = argument.string
  protected readonly signature = 'user_demote [@username | id]'

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

    usersRepo.setRoleById(context.db, user.id, Role.VIEWER)

    context.logger.sub('auth').info(`User "${user.id}" demoted to VIEWER`)

    await context.replyWithHTML(
      `🔽 <b>Роль сброшена</b>

@${user.username ?? '—'} | #${user.id} теперь <b>${roleTitle(Role.VIEWER)}</b>.`,
    )
  }
}

export const userDemoteCommand = new UserDemoteCommand()
