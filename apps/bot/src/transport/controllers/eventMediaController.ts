import {
  type StreamMessageController,
  bufferToJson,
  safeParseMediaProcessed,
} from '@spotter/transport'
import type { InputMediaPhoto, InputMediaVideo } from 'grammy/types'
import type { TransportContext } from '../../context'
import { eventMediaAction } from '../actions/eventMediaAction'
import { eventCode } from '../helpers/eventCode'

export const eventMediaController: StreamMessageController<
  TransportContext
> = async (payload, context): Promise<void> => {
  const { topic, message } = payload
  const { logger: baseLogger, s3, config } = context

  const value = bufferToJson(message.value)

  if (!value) {
    return
  }

  const processed = safeParseMediaProcessed(value)

  if (!processed) {
    return
  }

  // Depot hands back S3 keys; presign them into short-lived URLs for Telegram.
  // Credentials never leave the bot — only the signed URL is sent.
  const media: (InputMediaPhoto | InputMediaVideo)[] = []

  if (processed.clipKey) {
    media.push({
      type: 'video',
      media: s3.presign(processed.clipKey, { expiresIn: config.presignExpiry }),
    })
  }
  if (processed.snapshotKey) {
    media.push({
      type: 'photo',
      media: s3.presign(processed.snapshotKey, {
        expiresIn: config.presignExpiry,
      }),
    })
  }

  if (media.length === 0) {
    return
  }

  const logger = baseLogger.sub(topic, eventCode(processed.eventId))

  const nextContext = { ...context, logger }

  await eventMediaAction({ eventId: processed.eventId, media }, nextContext)
}
