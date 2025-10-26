import type { Event } from '../../../../../.prisma-generated'
import type { CoreContext } from '../../context'
import { get } from '../../helpers/get'
import type { MediaTuple } from '../helpers/resolveNvrMedia'
import { renderEventTiming } from './renderEventTiming'

export const renderEvent = (
  event: Event,
  context: CoreContext,
  mediaTuple?: MediaTuple,
): string => {
  const label = get(
    context.config.objectLabels,
    event.label ?? '',
    'неизв. объект',
  )

  const camera = get(context.config.cameraLabels, event.camera, 'неизв. камера')

  const score = Math.round(event.score * 1000) / 10

  const clip =
    mediaTuple?.hasClip && mediaTuple.clip
      ? `<a href="${mediaTuple.clip.url}">📼</a>`
      : ''
  const snapshot =
    mediaTuple?.hasSnapshot && mediaTuple.snapshot
      ? `<a href="${mediaTuple.snapshot.url}">📸</a>`
      : ''

  const title = event.type === 'start' ? 'Движение!' : 'Произошло событие!'

  const code = context.nvr.resolveEventCode(event.id)

  const timing = renderEventTiming(event, context.config.timezone)

  return `<b>${title}</b> <code>${code}</code>
<b>${label}</b> ${score} | <b>${camera}</b>${clip || snapshot ? ` | ${clip}${snapshot}` : ''}
📅 ${timing}`
}
