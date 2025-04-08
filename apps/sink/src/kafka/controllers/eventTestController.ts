import {
  type KafkaMessageController,
  bufferToJson,
  intervalHeartbeat,
} from '@spotter/transport'
import type { CoreContext } from '../../context'
import { publishEventToKafka } from '../../helpers/publishEvent'
import {
  type EventTestPayload,
  eventTestAction,
} from '../actions/eventTestAction'

export const eventTestController: KafkaMessageController<CoreContext> = async (
  payload,
  context,
) => {
  const { topic, message, heartbeat } = payload
  const { producer, config, logger: baseLogger } = context

  const value = bufferToJson(message.value)

  if (!value) {
    return
  }

  const unix = Date.now()

  const eventId =
    value.eventId ?? `${unix}-${Math.random().toString(36).slice(2)}`

  const rawTimestamp =
    typeof value.eventId === 'string'
      ? value.eventId.split('-').at(0)
      : undefined

  const timestamp = rawTimestamp ? Number.parseFloat(rawTimestamp) : undefined

  const actionPayload: EventTestPayload = {
    eventId,
    type: value.type ?? 'start',
    timestamp: timestamp && !Number.isNaN(timestamp) ? timestamp : unix,
  }

  const logger = baseLogger.sub('action', topic, actionPayload.eventId)

  await intervalHeartbeat(heartbeat, config.kafka, async () => {
    const event = await eventTestAction(actionPayload)

    if (!event) {
      return
    }

    logger.verbose('Back-message contents: ', event)

    const sent = await publishEventToKafka(event, producer)

    if (sent) {
      logger.debug(`Event sent to topic "${sent.topicName}"`)
    }
  })
}
