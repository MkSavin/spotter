import type { SpotterEvent } from '@spotter/transport'
import type { InputMediaVideo } from 'grammy/types'
import type { TransportContext } from '../../context'
import { eventClipPartsRepo, eventMessagesRepo } from '../../db/repository'
import type { EventMessage } from '../../db/schema'
import { InnoxiousMedia } from '../../extension/innoxious/InnoxiousMedia'
import { supplySubscribers } from '../helpers/supplySubscribers'
import { renderClipPart } from '../view/renderEvent'

/**
 * Sends parts 2…N of a cut clip as replies to the event message. A part
 * already recorded for a chat is not sent again, and the first part that fails
 * anywhere stops the rest: the retry resumes there, so parts stay in order.
 */
export const deliverClipParts = async (
  eventId: string,
  event: SpotterEvent,
  /** Presigned URLs of parts 2…N, in order. */
  urls: string[],
  context: TransportContext,
): Promise<void> => {
  const { bot, db } = context
  const total = urls.length + 1

  const anchors = new Map(
    eventMessagesRepo.find(db, eventId).map((m) => [m.chatId, m.id]),
  )

  for (const [offset, url] of urls.entries()) {
    const part = offset + 2
    const media = new InnoxiousMedia<InputMediaVideo>({
      type: 'video',
      media: url,
    })
    const caption = renderClipPart(event, part, total)

    const { supplied, failed } = await supplySubscribers(
      eventClipPartsRepo.find(db, eventId, part),
      context,
      {
        create: async (chatId): Promise<EventMessage> => {
          const anchor = anchors.get(chatId)
          const sent = await bot.api.innoxious.sendVideo(chatId, media, {
            caption,
            parse_mode: 'HTML',
            ...(anchor
              ? {
                  reply_parameters: {
                    message_id: anchor,
                    allow_sending_without_reply: true,
                  },
                }
              : {}),
          })
          return { id: sent.message_id, chatId }
        },
      },
    )

    eventClipPartsRepo.record(
      db,
      eventId,
      part,
      supplied
        .map((entry) => entry.data)
        .filter((entry): entry is EventMessage => Boolean(entry)),
    )

    if (failed) {
      throw new Error(`clip part ${part} of ${total} incomplete for ${eventId}`)
    }
  }
}
