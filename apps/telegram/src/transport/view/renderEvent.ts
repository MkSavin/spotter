import {
  eventCode,
  renderEventTiming,
  type SpotterEvent,
} from '@spotter/transport'
import type { CoreContext } from '../../context'

/**
 * What the message should say about the event's picture.
 *
 * `pending` — requested, still on its way. `absent` — the NVR has none.
 * `ready` — the photo is attached, so no indicator belongs on the line.
 */
export type MediaState = 'pending' | 'absent' | 'ready'

const MEDIA_MARKS: Partial<Record<MediaState, string>> = {
  pending: '📸 В обработке',
  absent: '🙈 Без снимка',
}

export type RenderEventOptions = {
  media?: MediaState
}

export const renderEvent = (
  event: SpotterEvent,
  context: CoreContext,
  options: RenderEventOptions = {},
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

  const mark = options.media ? MEDIA_MARKS[options.media] : undefined

  return `<b>${title}</b> <code>${code}</code>
<b>${label}</b> ${score} | <b>${camera}</b>${mark ? ` | ${mark}` : ''}
📅 ${timing}`
}
