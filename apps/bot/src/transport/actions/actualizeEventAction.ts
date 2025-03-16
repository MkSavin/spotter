import type { SpotterEvent } from '@spotter/transport'
import type { TransportContext } from '../../context'
import type { MediaTuple } from '../helpers/resolveFrigateMedia'
import { actualizeSentMessages } from '../mixins/actualizeSentMessages'
import { renderEvent } from '../view/renderEvent'

export const actualizeEventAction = async (
  event: SpotterEvent,
  context: TransportContext,
  mediaTuple: MediaTuple | undefined = undefined,
): Promise<void> => {
  const { logger, prisma } = context
  const { id, ...eventData } = event

  let storedEvent = await prisma.event.findUnique({
    where: {
      id,
    },
  })

  if (storedEvent?.type === 'end') {
    logger.debug('Event has already been ended. Skipping...')
    return
  }

  logger.debug(`Feeding ${event.type} event...`)

  storedEvent = await prisma.event.upsert({
    where: {
      id,
    },

    create: {
      ...event,
    },

    update: {
      ...eventData,
    },
  })

  const contents = renderEvent(storedEvent, context, mediaTuple)

  await actualizeSentMessages(id, storedEvent.messages, contents, context)

  logger.debug(`Feeding ${event.type} event successfully finished`)
}
