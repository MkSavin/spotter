import {
  type SpotterEvent,
  type StreamProducer,
  eventStreams,
} from '@spotter/transport'

/**
 * Publishes a canonical event onto the `spotter.event` stream. The stream is a
 * single ordered log, so per-event ordering is preserved without a partition
 * key.
 */
export const publishEvent = async (
  event: SpotterEvent,
  producer: StreamProducer,
): Promise<string> => producer.publish(eventStreams.event, event)
