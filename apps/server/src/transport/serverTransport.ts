import {
  catalogController,
  catalogUpdatedStream,
  deliveryStreams,
  eventStreams,
  mediaStreams,
  RedisRegulator,
  type RegulatorHandle,
} from '@spotter/transport'
import type { ServerContext } from '../context'
import { commandController } from './controllers/commandController'
import { eventController } from './controllers/eventController'
import { eventMediaController } from './controllers/eventMediaController'

export const serverTransport = async (
  context: ServerContext,
): Promise<RegulatorHandle> => {
  const logger = context.logger.sub('transport')

  return new RedisRegulator<ServerContext>()
    .message(eventStreams.event, eventController)
    .message(mediaStreams.mediaProcessed, eventMediaController)
    .message(catalogUpdatedStream, catalogController)
    .message(deliveryStreams.commandRequest, commandController)
    .run(
      { ...context, logger },
      {
        group: context.config.redis.group,
        consumer: context.config.redis.consumer,
        blockMs: context.config.redis.blockMs,
        count: context.config.redis.count,
        reclaimMinIdleMs: context.config.redis.reclaimMinIdleMs,
        reaperIntervalMs: context.config.redis.reaperIntervalMs,
        maxDeliveries: context.config.redis.maxDeliveries,
      },
    )
}
