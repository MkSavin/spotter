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

/**
 * Said when the NVR closed the event without attaching a clip, so the missing
 * "Видео" button reads as the NVR's verdict rather than as a broken bot.
 *
 * Film reel, not the button's clapperboard: the same medium, visibly not the
 * control — and distinct from the snapshot marks, which are a separate axis.
 */
const NO_CLIP_MARK = '🎞️ Без видео'

export type RenderEventOptions = {
  media?: MediaState
  /** Whether to say the event has no clip. Only meaningful once it has ended. */
  clipless?: boolean
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

  // Two independent axes: an event can lack both a snapshot and a clip.
  const marks = [
    options.media ? MEDIA_MARKS[options.media] : undefined,
    options.clipless ? NO_CLIP_MARK : undefined,
  ].filter(Boolean)

  return `<b>${title}</b> <code>${code}</code>
<b>${label}</b> ${score} | <b>${camera}</b>${marks.map((mark) => ` | ${mark}`).join('')}
📅 ${timing}`
}
