import type { DeliveryEvent } from '@spotter/transport'
import type { InputMediaPhoto, InputMediaVideo } from 'grammy/types'
import { pwaUrl } from '../../auth/pwaLink'
import type { TransportContext } from '../../context'
import { eventMessagesRepo } from '../../db/repository'
import type { EventMessage } from '../../db/schema'
import { MediaTooLargeError } from '../../extension/innoxious/InnoxiousMedia'
import { actualizeEventCaption } from '../mixins/actualizeEventCaption'
import { actualizeEventMedia } from '../mixins/actualizeEventMedia'
import { actualizeSentMessages } from '../mixins/actualizeSentMessages'
import { deliverClipParts } from '../mixins/deliverClipParts'
import {
  shouldOfferClip,
  shouldSayClipless,
  videoButtonKeyboard,
  watchInAppKeyboard,
} from '../view/eventKeyboard'
import { renderEvent } from '../view/renderEvent'

/**
 * A clip this Bot API will not take as an upload is not sent at all: the
 * message keeps its photo, says why there is no video, and links to the web
 * app when one is up. Attaches the snapshot first when the same delivery
 * carried it.
 */
const deliverOversized = async (
  delivery: DeliveryEvent,
  messages: EventMessage[],
  context: TransportContext,
): Promise<void> => {
  const { eventId, event, snapshotKey } = delivery
  const { s3, config, logger } = context
  const keyboard = watchInAppKeyboard(pwaUrl(context.heartbeats.all()), eventId)
  // The photo is on the message, or coming with this delivery, or never was.
  const caption = renderEvent(event, context, {
    media: snapshotKey || event.hasSnapshot ? 'ready' : 'absent',
    oversized: true,
  })

  if (snapshotKey) {
    const photo: InputMediaPhoto = {
      type: 'photo',
      media: s3.presign(snapshotKey, { expiresIn: config.presignExpiry }),
      caption,
      parse_mode: 'HTML',
    }
    await actualizeEventMedia(eventId, messages, photo, keyboard, context)
  } else {
    await actualizeEventCaption(eventId, messages, caption, keyboard, context)
  }

  logger.debug(`deliveryEvent (media/clip) too large to send for ${eventId}`)
}

export const deliveryEventAction = async (
  delivery: DeliveryEvent,
  context: TransportContext,
): Promise<void> => {
  const { logger, db, s3, config } = context
  const { eventId, event, action, clipKey, clipParts, snapshotKey } = delivery

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
    const { uploadLimit } = config.telegram
    const presign = (key: string): string =>
      s3.presign(key, { expiresIn: config.presignExpiry })
    // A clip over the part limit arrives cut: part 1 takes the message's
    // place, the rest follow as replies.
    const [head, ...rest] = clipParts ?? [clipKey]
    // Sizes are trusted only when they line up with the keys they describe.
    const sizes: (number | undefined)[] = clipParts
      ? delivery.clipPartBytes?.length === clipParts.length
        ? delivery.clipPartBytes
        : []
      : [delivery.clipBytes]
    const [headBytes, ...restBytes] = sizes

    // Known not to fit, in whole or in any part: no upload is attempted at
    // all. Half a clip would be worse than a link to the whole one.
    if (sizes.some((size) => size !== undefined && size > uploadLimit)) {
      await deliverOversized(delivery, messages, context)
      return
    }

    // The clip supersedes the snapshot: video replaces the photo, button gone.
    const video: InputMediaVideo = {
      type: 'video',
      media: presign(head ?? clipKey),
      // A clip arrived, so whatever the event advertised, it is not clipless.
      caption: renderEvent(event, context, {
        media: 'ready',
        parts: rest.length + 1,
      }),
      parse_mode: 'HTML',
    }
    // Telegram got the clip in pieces: the whole one is a tap away.
    const keyboard =
      rest.length > 0
        ? watchInAppKeyboard(pwaUrl(context.heartbeats.all()), eventId)
        : undefined

    try {
      await actualizeEventMedia(eventId, messages, video, keyboard, context, {
        size: headBytes,
        uploadLimit,
      })
    } catch (error) {
      // The size was learnt only on download: same outcome, later.
      if (!(error instanceof MediaTooLargeError)) throw error
      await deliverOversized(delivery, messages, context)
      return
    }

    if (rest.length > 0) {
      try {
        await deliverClipParts(
          eventId,
          event,
          rest.map(presign),
          restBytes,
          context,
        )
      } catch (error) {
        // Learnt only on download. The parts sent stay, and the message
        // already links to the whole clip where there is a web app.
        if (!(error instanceof MediaTooLargeError)) throw error
        logger.warn(`A later part of ${eventId} is over the upload limit`)
      }
    }

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
