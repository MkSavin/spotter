import { bufferToJson } from '@spotter/transport'
import type { CoreContext } from '../../context'
import { publishEventToKafka } from '../../helpers/publishEvent'
import { parseFrigateEvent } from '../../parsing/parseFrigateEvent'
import type { MqttMessageController } from '../../regulators/MqttRegulator'

export const frigateEventController: MqttMessageController<
  CoreContext
> = async (payload, context) => {
  const { topic, contents } = payload
  const { producer, logger: baseLogger } = context

  const value = bufferToJson(contents)
  const event = value ? parseFrigateEvent(value) : undefined

  if (!event) {
    baseLogger.debug('Got not parsable event. Skipping...')
    baseLogger.verbose('Event data:', value)
    return
  }

  const logger = baseLogger.sub('action', topic, event.id)

  const sent = await publishEventToKafka(event, producer)

  if (sent) {
    logger.debug(`Event sent to topic "${sent.topicName}"`)
  }
}
