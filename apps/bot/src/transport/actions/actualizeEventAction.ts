import type { SpotterEvent } from '@spotter/transport'
import type { TransportContext } from '../../context'
import { eventsRepo } from '../../db/repository'
import type { MediaTuple } from '../helpers/resolveNvrMedia'
import { actualizeSentMessages } from '../mixins/actualizeSentMessages'
import { renderEvent } from '../view/renderEvent'

export const actualizeEventAction = async (
  event: SpotterEvent,
  context: TransportContext,
  mediaTuple: MediaTuple | undefined = undefined,
): Promise<void> => {
  const { logger, db } = context
  const { id } = event

  let storedEvent = eventsRepo.find(db, id)

  if (storedEvent?.type === 'end') {
    logger.debug('Event has already been ended. Skipping...')
    return
  }

  logger.debug(`Feeding ${event.type} event...`)

  storedEvent = eventsRepo.upsert(db, event)

  const contents = renderEvent(storedEvent, context, mediaTuple)

  await actualizeSentMessages(id, storedEvent.messages, contents, context)

  logger.debug(`Feeding ${event.type} event successfully finished`)
}
