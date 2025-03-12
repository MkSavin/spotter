import type { Event } from '@prisma/client'
import type { Stenograph } from '../../framework/stenograph/Stenograph'

export const validateEvent = (
  contents: any,
  baseLogger: Stenograph,
): Event | null => {
  // TODO: add data validation and normalization
  const event = contents?.after

  const code = event?.id?.split('-').at(1)

  const logger = baseLogger.sub(code ?? 'empty', 'validator')

  if (!event || !event.id || !event.camera || !event.label) {
    logger.verbose('Bad event message')
    return null
  }

  // Possibly a buggy event
  // Look: https://github.com/blakeblackshear/frigate/discussions/9974
  if (event.position_changes === 0) {
    logger.verbose('Event has no position changes, skipping due to suspicion')
    return null
  }

  const type =
    contents.type === 'start' || contents.type === 'new' ? 'start' : 'end'

  return {
    id: event.id,
    code: code ?? event.id,
    camera: event.camera,
    frame_time: event.frame_time,
    label: event.label,
    top_score: event.top_score,
    false_positive: event.false_positive,
    start_time: event.start_time,
    end_time: event.end_time,
    score: event.score,
    area: event.area,
    ratio: event.ratio,
    stationary: event.stationary,
    has_clip: event.has_clip,
    has_snapshot: event.has_snapshot,
    type,
    messages: [],
  }
}
