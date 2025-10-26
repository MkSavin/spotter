import { KafkaRegulator } from '@spotter/transport'
import type { Bot } from 'grammy'
import type {
  BotApi,
  BotContext,
  CoreContext,
  TransportContext,
} from '../context'
import { cameraFrameController } from './controllers/cameraFrameController'
import { eventController } from './controllers/eventController'
import { eventMediaController } from './controllers/eventMediaController'

export const eventTransport = async (
  bot: Bot<BotContext, BotApi>,
  context: CoreContext,
): Promise<void> => {
  const logger = context.logger.sub('transport')

  await context.producer.connect()

  await new KafkaRegulator<TransportContext>()
    .message('spotter.event', eventController)
    .message('spotter.event.media_processed', eventMediaController)
    .message('spotter.camera.frame_processed', cameraFrameController)
    .run({
      ...context,
      logger,
      bot,
    })
}
