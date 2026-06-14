import { type StreamMessageController, bufferToJson } from '@spotter/transport'
import type { InputMediaPhoto, InputMediaVideo } from 'grammy/types'
import type { TransportContext } from '../../context'
import { eventMediaAction } from '../actions/eventMediaAction'
import { eventCode } from '../helpers/eventCode'

export const eventMediaController: StreamMessageController<
  TransportContext
> = async (payload, context): Promise<void> => {
  const { topic, message } = payload
  const { logger: baseLogger } = context

  const value = bufferToJson(message.value)

  if (!value) {
    return
  }

  const media: (InputMediaPhoto | InputMediaVideo)[] = []

  if (value.clipUrl) {
    media.push({
      type: 'video',
      media: value.clipUrl,
    })
  }
  if (value.snapshotUrl) {
    media.push({
      type: 'photo',
      media: value.snapshotUrl,
    })
  }

  const actionPayload = {
    eventId: value.eventId,
    media,
  }

  if (!actionPayload.eventId || actionPayload.media.length === 0) {
    return
  }

  const logger = baseLogger.sub(topic, eventCode(actionPayload.eventId))

  const nextContext = { ...context, logger }

  await eventMediaAction(actionPayload, nextContext)
}
