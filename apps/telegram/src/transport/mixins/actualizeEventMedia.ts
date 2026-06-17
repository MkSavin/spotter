import type { InlineKeyboard } from 'grammy'
import type { InputMediaPhoto, InputMediaVideo } from 'grammy/types'
import type { TransportContext } from '../../context'
import { eventMessagesRepo } from '../../db/repository'
import type { EventMessage } from '../../db/schema'
import { InnoxiousMedia } from '../../extension/innoxious/InnoxiousMedia'
import { supplySubscribers } from '../helpers/supplySubscribers'

type EventMedia = InputMediaPhoto | InputMediaVideo

/**
 * Attaches transcoded media to an event's messages in place.
 *
 * For chats that already have the event message, the text/photo is edited into
 * the new media via `editMessageMedia` (Bot API ≥ 7.11 allows adding media to a
 * text message, and swapping photo → video). Chats that joined after the text
 * was sent get a fresh media message instead. Each send first tries the naive
 * (presigned-URL) strategy, then falls back to buffering the bytes.
 *
 * `keyboard` is the inline markup to keep on the message (the "Видео" button for
 * a snapshot, or `undefined` for the final video, which removes the button).
 */
export const actualizeEventMedia = async (
  eventId: string,
  messages: EventMessage[],
  media: EventMedia,
  keyboard: InlineKeyboard | undefined,
  context: TransportContext,
): Promise<void> => {
  const { bot, db, logger } = context

  const innoxious = new InnoxiousMedia<EventMedia>(media)
  const markup = keyboard ? { reply_markup: keyboard } : {}
  const sendOptions = {
    caption: media.caption,
    parse_mode: 'HTML' as const,
    ...markup,
  }

  const editInPlace = async (
    chatId: string,
    messageId: number,
  ): Promise<void> => {
    try {
      await bot.api.editMessageMedia(
        chatId,
        messageId,
        await innoxious.naive(),
        markup,
      )
    } catch (naiveError) {
      logger.debug(
        'editMessageMedia (naive) failed, retrying accurate',
        naiveError,
      )
      await bot.api.editMessageMedia(
        chatId,
        messageId,
        await innoxious.accurate(),
        markup,
      )
    }
  }

  try {
    const supplied = await supplySubscribers(messages, context, {
      create: async (chatId): Promise<EventMessage> => {
        const sent =
          media.type === 'video'
            ? await bot.api.innoxious.sendVideo(chatId, innoxious, sendOptions)
            : await bot.api.innoxious.sendPhoto(chatId, innoxious, sendOptions)
        return { id: sent.message_id, chatId }
      },
      update: async (message): Promise<EventMessage> => {
        await editInPlace(message.chatId, message.id)
        return message
      },
    })

    const affected = supplied
      .map((entry) => entry.data)
      .filter((entry): entry is EventMessage => Boolean(entry))

    eventMessagesRepo.set(db, eventId, affected)
  } catch (error) {
    logger.error('Error when actualizing event media', error)
  }
}
