import type { BotContext as BaseContext } from '../../context'
import type { CommandMiddleware } from '../types'

export const sender = <Context extends BaseContext>(
  instruction: 'present' | 'not-present',
): CommandMiddleware<Context> => {
  return async (context, next) => {
    const from = context.from

    if (instruction === 'present' && !from) {
      return context.reply('Команда должна быть вызвана пользователем')
    }

    if (instruction === 'not-present' && from) {
      return context.reply(
        'Команда должна быть вызвана без контекста пользователя',
      )
    }

    return next()
  }
}
