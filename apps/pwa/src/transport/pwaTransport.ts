import {
  catalogController,
  catalogUpdatedStream,
  deliveryStreams,
  heartbeatStream,
  RedisRegulator,
  type RegulatorHandle,
} from '@spotter/transport'
import type { CoreContext, TransportContext } from '../context'
import { deliveryEventController } from './controllers/deliveryEventController'
import { heartbeatController } from './controllers/heartbeatController'
import { recipientController } from './controllers/recipientController'

export const pwaTransport = async (
  context: CoreContext,
): Promise<RegulatorHandle> => {
  const logger = context.logger.sub('transport')

  return new RedisRegulator<TransportContext>()
    .message(deliveryStreams.deliveryEvent, deliveryEventController)
    .message(deliveryStreams.deliveryRecipient, recipientController)
    .message(catalogUpdatedStream, catalogController)
    .message(heartbeatStream, heartbeatController)
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
