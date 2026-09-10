import type { InlineKeyboard } from 'grammy'
import type { InputMediaPhoto, InputMediaVideo } from 'grammy/types'
import type { TransportContext } from '../../context'
import { eventMessagesRepo } from '../../db/repository'
import type { EventMessage } from '../../db/schema'
import { InnoxiousMedia } from '../../extension/innoxious/InnoxiousMedia'
import { supplySubscribers } from '../helpers/supplySubscribers'

type EventMedia = InputMediaPhoto | InputMediaVideo

/**
 * Edits media into the existing message where there is one, else sends a new
 * one. Presigned URL first, buffered bytes as fallback.
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
      // Reason only: the error object expands into a grammY source dump.
      logger.debug(
        `editMessageMedia (naive) failed, retrying accurate: ${(naiveError as Error)?.message}`,
      )
      await bot.api.editMessageMedia(
        chatId,
        messageId,
        await innoxious.accurate(),
        markup,
      )
    }
  }

  const { supplied, failed } = await supplySubscribers(messages, context, {
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

  // Merged, never replaced: a wipe makes the retry re-send to served chats.
  eventMessagesRepo.record(db, eventId, affected)

  if (failed) {
    logger.warn(`Some chats failed for ${eventId}; leaving pending for retry`)
    throw new Error(`media delivery incomplete for event ${eventId}`)
  }
}
