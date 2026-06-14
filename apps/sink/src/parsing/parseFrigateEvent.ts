import { type SpotterEvent, parseSpotterEvent } from '@spotter/transport'

export const parseFrigateEvent = (contents: any): SpotterEvent => {
  const event = contents?.after

  if (!event || !event.id || !event.camera || !event.label) {
    throw new Error('Got not parsable event. Skipping...')
  }

  const type =
    contents.type === 'new' || contents.type === 'start'
      ? 'start'
      : contents.type

  // Possibly a buggy event
  // Look: https://github.com/blakeblackshear/frigate/discussions/9974
  if (event.position_changes === 0) {
    throw new Error('Event has no position changes, skipping due to suspicion')
  }

  // Map Frigate's payload to the canonical contract and validate before it
  // leaves the adapter — throws ZodError on type drift, caught by the controller.
  return parseSpotterEvent({
    id: event.id,
    camera: event.camera,
    label: event.label,
    startTime: event.start_time,
    endTime: event.end_time ?? null,
    score: event.score,
    stationary: !!event.stationary,
    hasClip: !!event.has_clip,
    hasSnapshot: !!event.has_snapshot,
    type,
  })
}
