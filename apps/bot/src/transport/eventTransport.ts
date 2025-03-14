import { KafkaRegulator } from '@spotter/transport'
import type { Bot } from 'grammy'
import type { BotContext, CoreContext, TransportContext } from '../context'
import { eventController } from './controllers/eventController'
import { eventMediaController } from './controllers/eventMediaController'
import { cameraFrameController } from './controllers/cameraFrameController'

export const eventTransport = async (
  bot: Bot<BotContext>,
  context: CoreContext,
): Promise<void> => {
  const logger = context.logger.sub('transport')

  await context.producer.connect()

  await new KafkaRegulator<TransportContext>()
    .on('spotter.event', eventController)
    .on('spotter.event.media_processed', eventMediaController)
    .on('spotter.camera.frame_processed', cameraFrameController)
    .run({
      ...context,
      logger,
      bot,
    })
}
