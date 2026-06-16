import type { DeliveryEvent } from '@spotter/transport'
import type { InputMediaPhoto, InputMediaVideo } from 'grammy/types'
import type { TransportContext } from '../../context'
import { eventMessagesRepo } from '../../db/repository'
import type { EventMessage } from '../../db/schema'
import { InnoxiousMediaGroup } from '../../extension/innoxious/InnoxiousMedia'
import { supplySubscribers } from '../helpers/supplySubscribers'
import { actualizeSentMessages } from '../mixins/actualizeSentMessages'
import { renderEvent } from '../view/renderEvent'

export const deliveryEventAction = async (
  delivery: DeliveryEvent,
  context: TransportContext,
): Promise<void> => {
  const { logger, db, bot, s3, config } = context
  const { eventId, event, action, clipKey, snapshotKey } = delivery

  if (action === 'create' || action === 'update') {
    const messages = eventMessagesRepo.find(db, eventId)
    const contents = renderEvent(event, context)

    await actualizeSentMessages(eventId, messages, contents, context)

    logger.debug(`deliveryEvent (${action}) processed for ${eventId}`)
    return
  }

  // action === 'media'
  const media: (InputMediaPhoto | InputMediaVideo)[] = []

  if (clipKey) {
    media.push({
      type: 'video',
      media: s3.presign(clipKey, { expiresIn: config.presignExpiry }),
    })
  }
  if (snapshotKey) {
    media.push({
      type: 'photo',
      media: s3.presign(snapshotKey, { expiresIn: config.presignExpiry }),
    })
  }

  if (media.length === 0) return

  const innoxeus = new InnoxiousMediaGroup(media)
  const contents = renderEvent(event, context)
  const options = { parse_mode: 'HTML' as const }

  const messages = eventMessagesRepo.find(db, eventId)

  const sendMedia = async (message: EventMessage): Promise<void> => {
    await bot.api.innoxious.sendMediaGroup(message.chatId, innoxeus, {
      reply_to_message_id: message.id,
      disable_notification: true,
    })
  }

  await supplySubscribers(messages, context, {
    create: async (chatId) => {
      const msg = await bot.api.sendMessage(chatId, contents, options)
      await sendMedia({ id: msg.message_id, chatId })
    },
    update: async (message) => {
      await sendMedia(message)
    },
  })

  logger.debug(`deliveryEvent (media) processed for ${eventId}`)
}
