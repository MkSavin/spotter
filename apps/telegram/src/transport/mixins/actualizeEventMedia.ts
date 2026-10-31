import type { InlineKeyboard } from 'grammy'
import type { InputMediaPhoto, InputMediaVideo } from 'grammy/types'
import type { TransportContext } from '../../context'
import { eventMessagesRepo } from '../../db/repository'
import type { EventMessage } from '../../db/schema'
import {
  InnoxiousMedia,
  type MediaOptions,
  MediaTooLargeError,
} from '../../extension/innoxious/InnoxiousMedia'
import { supplySubscribers } from '../helpers/supplySubscribers'

type EventMedia = InputMediaPhoto | InputMediaVideo

/**
 * Edits media into the existing message where there is one, else sends a new
 * one. Presigned URL first, buffered bytes as fallback. A file over the upload
 * limit surfaces as `MediaTooLargeError`: no chat can take it, so it is not a
 * partial failure to retry.
 */
export const actualizeEventMedia = async (
  eventId: string,
  messages: EventMessage[],
  media: EventMedia,
  keyboard: InlineKeyboard | undefined,
  context: TransportContext,
  options: MediaOptions = {},
): Promise<void> => {
  const { bot, db, logger } = context

  const innoxious = new InnoxiousMedia<EventMedia>(media, options)
  const markup = keyboard ? { reply_markup: keyboard } : {}
  const sendOptions = {
    caption: media.caption,
    parse_mode: 'HTML' as const,
    ...markup,
  }

  let tooLarge: MediaTooLargeError | undefined
  const noting = async <T>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work()
    } catch (error) {
      if (error instanceof MediaTooLargeError) tooLarge = error
      throw error
    }
  }

  try {
    const { supplied, failed } = await supplySubscribers(messages, context, {
      create: (chatId): Promise<EventMessage> =>
        noting(async () => {
          const sent =
            media.type === 'video'
              ? await bot.api.innoxious.sendVideo(
                  chatId,
                  innoxious,
                  sendOptions,
                )
              : await bot.api.innoxious.sendPhoto(
                  chatId,
                  innoxious,
                  sendOptions,
                )
          return { id: sent.message_id, chatId }
        }),
      update: (message): Promise<EventMessage> =>
        noting(async () => {
          await bot.api.innoxious.editMessageMedia(
            message.chatId,
            message.id,
            innoxious,
            markup,
          )
          return message
        }),
    })

    const affected = supplied
      .map((entry) => entry.data)
      .filter((entry): entry is EventMessage => Boolean(entry))

    // Merged, never replaced: a wipe makes the retry re-send to served chats.
    eventMessagesRepo.record(db, eventId, affected)

    if (tooLarge) throw tooLarge

    if (failed) {
      logger.warn(`Some chats failed for ${eventId}; leaving pending for retry`)
      throw new Error(`media delivery incomplete for event ${eventId}`)
    }
  } finally {
    // One download served every chat; it is not needed past this point.
    await innoxious.dispose()
  }
}
