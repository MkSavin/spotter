import type { BotContext as BaseContext } from '../../context'
import { Role } from '../../db/schema'
import type { CommandMiddleware } from '../types'

export const guard = <Context extends BaseContext>(
  instruction: Role | 'anonymous' | 'authorized',
): CommandMiddleware<Context> => {
  return async (context, next) => {
    const role = context.session.user.authorizedRole

    if (instruction === 'authorized' || instruction === 'anonymous') {
      if (instruction === 'authorized' && !role) {
        return context.reply(
          'Эта команда доступна только авторизованным пользователям',
        )
      }

      if (instruction === 'anonymous' && !!role) {
        return context.reply(
          'Эта команда доступна только неавторизованным пользователям',
        )
      }
    } else if (instruction !== role) {
      return context.reply(
        `Эта команда доступна только ${instruction === Role.ADMIN ? 'администраторам' : 'обычным пользователям'}`,
      )
    }

    return next()
  }
}
