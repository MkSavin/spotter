import type { SpotterEvent } from '@spotter/transport'
import type { CoreContext } from '../../context'
import { eventCode } from '../helpers/eventCode'
import { renderEventTiming } from './renderEventTiming'

export const renderEvent = (
  event: SpotterEvent,
  context: CoreContext,
): string => {
  const source = event.source ?? context.config.source

  const label = context.catalog.objectLabel(
    source,
    event.label ?? '',
    'неизв. объект',
  )
  const camera = context.catalog.cameraLabel(
    source,
    event.camera,
    'неизв. камера',
  )

  const score = Math.round(event.score * 1000) / 10
  const title = event.type === 'start' ? 'Движение!' : 'Произошло событие!'
  const code = eventCode(event.id)
  const timing = renderEventTiming(event, context.config.timezone)

  return `<b>${title}</b> <code>${code}</code>
<b>${label}</b> ${score} | <b>${camera}</b>
📅 ${timing}`
}
