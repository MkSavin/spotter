import {
  type KafkaMessageController,
  bufferToJson,
  intervalHeartbeat,
} from '@spotter/transport'
import type { InputMediaPhoto, InputMediaVideo } from 'grammy/out/types.node'
import type { TransportContext } from '../../context'
import { eventMediaAction } from '../actions/eventMediaAction'
import { eventCode } from '../helpers/eventCode'

export const eventMediaController: KafkaMessageController<
  TransportContext
> = async (payload, context): Promise<void> => {
  const { topic, message, heartbeat } = payload
  const { config, logger: baseLogger } = context

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

  await intervalHeartbeat(heartbeat, config.kafka, async () => {
    await eventMediaAction(actionPayload, nextContext)
  })
}
