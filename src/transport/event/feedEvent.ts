import dayjs from 'dayjs'
import type { Bot } from 'grammy'
import type { Context, InitContext } from '../../context'
import { feedEndEvent } from './feedEndEvent'
import { feedStartEvent } from './feedStartEvent'
import { validateEvent } from './validateEvent'

export const feedEvent = async (
  bot: Bot<Context>,
  context: InitContext,
  contents: any,
): Promise<void> => {
  const event = validateEvent(contents)

  if (!event) {
    return
  }

  const logger = context.logger.sub(
    `${event.code} (${dayjs.unix(event.start_time).format('YYYY-MM-DD HH:mm')}) [${event.type}]`,
  )

  logger.debug('Trying to feed received event')

  const nextContext = {
    ...context,
    logger,
  }

  if (event.type === 'start') {
    await feedStartEvent(bot, nextContext, event)
  } else {
    await feedEndEvent(bot, nextContext, event)
  }
}
