import type { DeliveryEvent } from '@spotter/transport'
import type { InputMediaPhoto, InputMediaVideo } from 'grammy/types'
import type { TransportContext } from '../../context'
import { eventMessagesRepo } from '../../db/repository'
import { actualizeEventMedia } from '../mixins/actualizeEventMedia'
import { actualizeSentMessages } from '../mixins/actualizeSentMessages'
import { shouldOfferClip, videoButtonKeyboard } from '../view/eventKeyboard'
import { renderEvent } from '../view/renderEvent'

export const deliveryEventAction = async (
  delivery: DeliveryEvent,
  context: TransportContext,
): Promise<void> => {
  const { logger, db, s3, config } = context
  const { eventId, event, action, clipKey, snapshotKey } = delivery

  const caption = renderEvent(event, context)

  if (action === 'create' || action === 'update') {
    const messages = eventMessagesRepo.find(db, eventId)
    // Offer the clip once the event has ended and advertises a clip.
    const keyboard = shouldOfferClip(event)
      ? videoButtonKeyboard(eventId)
      : undefined

    await actualizeSentMessages(eventId, messages, caption, context, keyboard)

    logger.debug(`deliveryEvent (${action}) processed for ${eventId}`)
    return
  }

  // action === 'media' — attach transcoded media to the existing messages.
  const messages = eventMessagesRepo.find(db, eventId)

  // The media edit below repaints the button, so the wait is over either way.
  context.clips.complete(eventId)

  if (clipKey) {
    // The clip supersedes the snapshot: video replaces the photo, button gone.
    const video: InputMediaVideo = {
      type: 'video',
      media: s3.presign(clipKey, { expiresIn: config.presignExpiry }),
      caption,
      parse_mode: 'HTML',
    }
    await actualizeEventMedia(eventId, messages, video, undefined, context)
    logger.debug(`deliveryEvent (media/clip) processed for ${eventId}`)
    return
  }

  if (snapshotKey) {
    const photo: InputMediaPhoto = {
      type: 'photo',
      media: s3.presign(snapshotKey, { expiresIn: config.presignExpiry }),
      caption,
      parse_mode: 'HTML',
    }
    const keyboard = shouldOfferClip(event)
      ? videoButtonKeyboard(eventId)
      : undefined
    await actualizeEventMedia(eventId, messages, photo, keyboard, context)
    logger.debug(`deliveryEvent (media/snapshot) processed for ${eventId}`)
    return
  }

  // Nothing came back (the NVR no longer has this event). Restore the button
  // instead of leaving it stuck on "processing".
  if (shouldOfferClip(event)) {
    await actualizeSentMessages(
      eventId,
      messages,
      caption,
      context,
      videoButtonKeyboard(eventId),
    )
  }
  logger.debug(`deliveryEvent (media) had nothing to attach for ${eventId}`)
}
