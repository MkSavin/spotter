import type { BotContext } from '../../context'
import { usersRepo } from '../../db/repository'
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
    if (typeof context.match !== 'string') {
      return
    }

    const [ref, roleArg] = context.match.trim().split(/\s+/)
    const role = roleArg ? parseRole(roleArg) : undefined

    if (!ref || !role) {
      await context.replyWithHTML(
        `<b>Неверный список аргументов команды!</b>
Сигнатура команды: <code>${this.signature}</code>`,
      )
      return
    }

    const user = usersRepo.findByRef(context.db, ref)

    if (!user) {
      await context.replyWithHTML(
        `🔍 <b>Пользователь <code>${ref}</code> не найден</b>`,
      )
      return
    }

    usersRepo.setRoleById(context.db, user.id, role)

    context.logger.sub('auth').info(`User "${user.id}" role changed to ${role}`)

    await context.replyWithHTML(
      `🆙 <b>Роль обновлена</b>

@${user.username ?? '—'} | #${user.id} теперь <b>${roleTitle(role)}</b>.`,
    )
  }
}

export const userPromoteCommand = new UserPromoteCommand()
