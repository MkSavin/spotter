import {
  catalogController,
  catalogUpdatedStream,
  deliveryStreams,
  RedisRegulator,
  type RegulatorHandle,
} from '@spotter/transport'
import type { CoreContext, TransportContext } from '../context'
import { deliveryEventController } from './controllers/deliveryEventController'

export const pwaTransport = async (
  context: CoreContext,
): Promise<RegulatorHandle> => {
  const logger = context.logger.sub('transport')

  return new RedisRegulator<TransportContext>()
    .message(deliveryStreams.deliveryEvent, deliveryEventController)
    .message(catalogUpdatedStream, catalogController)
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
