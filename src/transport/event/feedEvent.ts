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
    context.logger.verbose('Bad event!')
    return
  }

  const logger = context.logger.sub(
    `${event.code} (${dayjs.unix(event.start_time).format('YYYY-MM-DD HH:mm')}) [${event.type}]`,
  )

  logger.debug('Trying to feed received event', event)

  const nextContext = {
    ...context,
    logger,
  }

  if (event.type === 'end') {
    await feedEndEvent(bot, nextContext, event)
    return
  }

  await feedStartEvent(bot, nextContext, event)
}
