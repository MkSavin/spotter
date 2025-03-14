import type { SpotterEvent } from '@spotter/transport'
import type { Message, Producer, RecordMetadata } from 'kafkajs'

export const publishEventToKafka = async (
  event: SpotterEvent,
  producer: Producer,
): Promise<RecordMetadata | undefined> => {
  const message: Message = {
    key: `event-${event.id}`,
    value: JSON.stringify(event),
  }

  const sent = await producer.send({
    topic: 'spotter.event',
    messages: [message],
  })

  return sent.at(0)
}
