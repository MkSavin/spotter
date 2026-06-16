import type { BotContext as BaseContext } from '../../context'
import type { CommandMiddleware } from '../types'

export type ArgumentMatcher = <Context extends BaseContext>(
  match: string | RegExpMatchArray | undefined,
  context: Context,
) => boolean

export const argument = <Context extends BaseContext>(
  match: ArgumentMatcher,
  label: ((context: Context) => string) | string,
): CommandMiddleware<Context> => {
  return async (context, next) => {
    if (!match(context.match, context)) {
      return context.replyWithHTML(
        `<b>Неверный список аргументов команды!</b>
Сигнатура команды: <code>${typeof label === 'string' ? label : label(context)}</code>`,
      )
    }
    return next()
  }
}

const stringMatcher: ArgumentMatcher = (match) => typeof match === 'string'
const stringOptionalMatcher: ArgumentMatcher = (match) =>
  !match || typeof match === 'string'

argument.string = stringMatcher
argument.stringOptional = stringOptionalMatcher
