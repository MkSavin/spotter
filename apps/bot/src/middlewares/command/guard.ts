import { $Enums } from '@prisma/client'
import type { BotContext as BaseContext } from '../../context'
import type { CommandMiddleware } from '../types'

export const guard = <Context extends BaseContext>(
  instruction: $Enums.Role | 'anonymous' | 'authorized',
): CommandMiddleware<Context> => {
  return async (context, next) => {
    const auth = context.auth

    if (instruction === 'authorized' || instruction === 'anonymous') {
      if (instruction === 'authorized' && !auth?.user) {
        return context.reply(
          'Эта команда доступна только авторизованным пользователям',
        )
      }

      if (instruction === 'anonymous' && !!auth?.user) {
        return context.reply(
          'Эта команда доступна только неавторизованным пользователям',
        )
      }
    } else if (instruction !== context.auth?.user?.role) {
      return context.reply(
        `Эта команда доступна только ${instruction === $Enums.Role.ADMIN ? 'администраторам' : 'обычным пользователям'}`,
      )
    }

    return next()
  }
}
