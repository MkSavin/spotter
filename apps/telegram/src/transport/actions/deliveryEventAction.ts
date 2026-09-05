import type { DeliveryEvent } from '@spotter/transport'
import type { InputMediaPhoto, InputMediaVideo } from 'grammy/types'
import type { TransportContext } from '../../context'
import { eventMessagesRepo } from '../../db/repository'
import { actualizeEventMedia } from '../mixins/actualizeEventMedia'
import { actualizeSentMessages } from '../mixins/actualizeSentMessages'
import {
  shouldOfferClip,
  shouldSayClipless,
  videoButtonKeyboard,
} from '../view/eventKeyboard'
import { renderEvent } from '../view/renderEvent'

export const deliveryEventAction = async (
  delivery: DeliveryEvent,
  context: TransportContext,
): Promise<void> => {
  const { logger, db, s3, config } = context
  const { eventId, event, action, clipKey, snapshotKey } = delivery

  if (action === 'create' || action === 'update') {
    const messages = eventMessagesRepo.find(db, eventId)
    // Offer the clip once the event has ended and advertises a clip.
    const keyboard = shouldOfferClip(event)
      ? videoButtonKeyboard(eventId)
      : undefined

    // A snapshot is requested the moment an event ends, so say it is coming
    // rather than leaving a bare text message that looks final.
    const caption = renderEvent(event, context, {
      media: event.type === 'end' ? 'pending' : undefined,
      clipless: shouldSayClipless(event),
    })

    await actualizeSentMessages(eventId, messages, caption, context, keyboard)

    logger.debug(`deliveryEvent (${action}) processed for ${eventId}`)
    return
  }

  // action === 'media' — attach transcoded media to the existing messages.
  const messages = eventMessagesRepo.find(db, eventId)

  // The photo is on the message now, so the indicator has done its job. The
  // clip mark stays: a delivered snapshot says nothing about a missing clip.
  const caption = renderEvent(event, context, {
    media: 'ready',
    clipless: shouldSayClipless(event),
  })

  // Nothing came back — the NVR has no media for this event. Mark the text so
  // an empty notification is not mistaken for one still waiting on its photo.
  if (!clipKey && !snapshotKey) {
    context.clips.fail(
      eventId,
      'Видео ещё не готово — попробуй через полминуты',
    )

    const keyboard = shouldOfferClip(event)
      ? videoButtonKeyboard(eventId)
      : undefined

    await actualizeSentMessages(
      eventId,
      messages,
      renderEvent(event, context, {
        media: 'absent',
        clipless: shouldSayClipless(event),
      }),
      context,
      keyboard,
    )

    logger.debug(`deliveryEvent (media) had nothing to attach for ${eventId}`)
    return
  }

  // The media edit below repaints the button, so the wait is over either way.
  context.clips.complete(eventId)

  if (clipKey) {
    // The clip supersedes the snapshot: video replaces the photo, button gone.
    const video: InputMediaVideo = {
      type: 'video',
      media: s3.presign(clipKey, { expiresIn: config.presignExpiry }),
      // A clip arrived, so whatever the event advertised, it is not clipless.
      caption: renderEvent(event, context, { media: 'ready' }),
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
  }
}
