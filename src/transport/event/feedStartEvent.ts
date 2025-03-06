import type { Event } from '@prisma/client'
import type { Bot } from 'grammy'
import omit from 'lodash/omit'
import type { Context, InitContext } from '../../context'
import { renderEvent } from './renderEvent'
import type { EventMessage } from '.prisma/client'

export const feedStartEvent = async (
  bot: Bot<Context>,
  context: InitContext,
  event: Event,
): Promise<void> => {
  let storedEvent = await context.prisma.event.findUnique({
    where: {
      id: event.id,
    },
  })

  if (storedEvent?.type === 'end') {
    return
  }

  context.logger.debug('Feeding start event...')

  storedEvent = await context.prisma.event.upsert({
    where: {
      id: event.id,
    },

    create: {
      ...event,
    },

    update: {
      ...omit(event, ['id', 'messages']),
    },
  })

  const contents = renderEvent(storedEvent, context)

  const chats = await context.prisma.chat.findMany({
    select: {
      id: true,
    },
  })

  const messages = await Promise.all(
    chats.map((chat) =>
      bot.api
        .sendMessage(chat.id, contents, {
          parse_mode: 'HTML',
        })
        .then(
          (message): EventMessage => ({
            id: message.message_id,
            chat_id: chat.id,
          }),
        ),
    ),
  )

  await context.prisma.event.update({
    where: {
      id: event.id,
    },

    data: {
      messages,
    },
  })

  context.logger.info('Start event successfully fed up')
}
