import dayjs from 'dayjs'
import type { Middleware } from 'grammy'
import type { Context } from '../../context'
import { logger as coreLogger } from '../../log'

const subLogger = (context: Context): string[] => {
  const from = context.from
  const chat = context.chat
  const message = context.message

  const who = from?.username
    ? `user/@${from?.username}`
    : chat?.id
      ? `chat/${chat?.id?.toString()}`
      : 'unkn/unkn'

  const commandEntity = message?.entities?.find(
    (entity) => entity.type === 'bot_command',
  )

  const commandName = commandEntity
    ? message?.text?.substring(commandEntity.offset, commandEntity.length)
    : undefined

  const what = commandName ?? 'message'

  const when = dayjs().format('YYYY-MM-DD HH:mm:ss')

  return [who, what, when]
}

export const logging: Middleware<Context> = (context, next) => {
  context.logger = coreLogger.sub(...subLogger(context))

  return next()
}
