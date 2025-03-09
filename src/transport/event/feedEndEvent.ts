import type { Event } from '@prisma/client'
import type { Bot } from 'grammy'
import type { Context, InitContext } from '../../context'
import { omit } from '../../helpers/omit'
import { feedMedia, resolveMedia } from './feedMedia'
import { renderEvent } from './renderEvent'
import type { EventMessage } from '.prisma/client'

export const feedEndEvent = async (
  bot: Bot<Context>,
  context: InitContext,
  event: Event,
): Promise<void> => {
  let storedEvent = await context.prisma.event.findUnique({
    where: {
      id: event.id,
    },
  })

  if (storedEvent && storedEvent.type === 'end') {
    return
  }

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

  context.logger.debug('Feeding end event')

  const messages = storedEvent.messages

  const mediaTuple = await resolveMedia(storedEvent, context)

  const contents = renderEvent(storedEvent, context, mediaTuple)

  const actualChats = await context.prisma.chat.findMany({
    select: {
      id: true,
    },
  })

  const actualIds = actualChats.map((chat) => chat.id)
  const storedIds = messages.map((entry) => entry.chat_id)

  const sendList = actualIds
    .filter((id) => !storedIds.includes(id))
    .map((id) =>
      bot.api
        .sendMessage(id, contents, {
          parse_mode: 'HTML',
        })
        .then(
          (message): EventMessage => ({
            chat_id: id,
            id: message.message_id,
          }),
        ),
    )

  const editList = messages
    .filter((entry) => actualIds.includes(entry.chat_id))
    .map((entry) =>
      bot.api
        .editMessageText(entry.chat_id, entry.id, contents, {
          parse_mode: 'HTML',
        })
        .then(() => entry),
    )

  const processedMessages = await Promise.all([...sendList, ...editList])

  context.logger.debug('Feeding media for event')

  await feedMedia(bot, context, processedMessages, mediaTuple)

  context.logger.info('End event successfully fed up')
}
