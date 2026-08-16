import {
  catalogUpdatedStream,
  deliveryStreams,
  heartbeatStream,
  mediaStreams,
  RedisRegulator,
  type RegulatorHandle,
} from '@spotter/transport'
import type { Bot } from 'grammy'
import type {
  BotApi,
  BotContext,
  CoreContext,
  TransportContext,
} from '../context'
import { cameraFrameController } from './controllers/cameraFrameController'
import { catalogController } from './controllers/catalogController'
import { deliveryEventController } from './controllers/deliveryEventController'
import { deliveryRecipientController } from './controllers/deliveryRecipientController'
import { heartbeatController } from './controllers/heartbeatController'

export const telegramTransport = async (
  bot: Bot<BotContext, BotApi>,
  context: CoreContext,
): Promise<RegulatorHandle> => {
  const logger = context.logger.sub('transport')

  return new RedisRegulator<TransportContext>()
    .message(deliveryStreams.deliveryEvent, deliveryEventController)
    .message(deliveryStreams.deliveryRecipient, deliveryRecipientController)
    .message(mediaStreams.cameraProcessed, cameraFrameController)
    .message(catalogUpdatedStream, catalogController)
    .message(heartbeatStream, heartbeatController)
    .run(
      { ...context, logger, bot },
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
