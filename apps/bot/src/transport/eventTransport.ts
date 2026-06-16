import {
  RedisRegulator,
  type RegulatorHandle,
  catalogUpdatedStream,
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
import { eventController } from './controllers/eventController'
import { eventMediaController } from './controllers/eventMediaController'

export const eventTransport = async (
  bot: Bot<BotContext, BotApi>,
  context: CoreContext,
): Promise<RegulatorHandle> => {
  const logger = context.logger.sub('transport')

  return new RedisRegulator<TransportContext>()
    .message('spotter.event', eventController)
    .message('spotter.event.media_processed', eventMediaController)
    .message('spotter.camera.frame_processed', cameraFrameController)
    .message(catalogUpdatedStream, catalogController)
    .run(
      {
        ...context,
        logger,
        bot,
      },
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
