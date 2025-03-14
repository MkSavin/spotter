import type { BotContext as BaseContext } from '../../context'
import type { CommandMiddleware } from '../types'

export const sender = <Context extends BaseContext>(
  instruction: 'present' | 'not-present' | 'current',
): CommandMiddleware<Context> => {
  return async (context, next) => {
    const from = context.from

    if (instruction === 'present' && !from) {
      return context.reply('Команда должна быть вызвана пользователем')
    }

    if (instruction === 'not-present' && !!from) {
      return context.reply(
        'Команда должна быть вызвана без контекста пользователя',
      )
    }

    const auth = context.auth

    if (
      instruction === 'current' &&
      (!auth?.user?.id || !from?.id || auth.user.id !== from.id.toString())
    ) {
      return context.reply(
        'Эта команда должна быть вызвана текущим пользователем',
      )
    }

    return next()
  }
}
