import {
  catalogController,
  catalogUpdatedStream,
  deliveryStreams,
  heartbeatStream,
  mediaStreams,
  probeStreams,
  RedisRegulator,
  type RegulatorHandle,
  timelapseStreams,
} from '@spotter/transport'
import type { Bot } from 'grammy'
import type {
  BotApi,
  BotContext,
  CoreContext,
  TransportContext,
} from '../context'
import { cameraFrameController } from './controllers/cameraFrameController'
import { deliveryEventController } from './controllers/deliveryEventController'
import { deliveryRecipientController } from './controllers/deliveryRecipientController'
import { heartbeatController } from './controllers/heartbeatController'
import { mediaProgressController } from './controllers/mediaProgressController'
import { probeResultController } from './controllers/probeResultController'
import {
  timelapseFailedController,
  timelapseProgressController,
  timelapseReadyController,
} from './controllers/timelapseController'

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
    .message(mediaStreams.mediaProgress, mediaProgressController)
    .message(probeStreams.result, probeResultController)
    .message(timelapseStreams.progress, timelapseProgressController)
    .message(timelapseStreams.ready, timelapseReadyController)
    .message(timelapseStreams.failed, timelapseFailedController)
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
