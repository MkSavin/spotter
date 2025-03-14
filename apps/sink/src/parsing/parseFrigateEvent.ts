import type { SpotterEvent } from '@spotter/transport'

export const parseFrigateEvent = (contents: any): SpotterEvent | null => {
  const event = contents?.after

  if (!event || !event.id || !event.camera || !event.label) {
    return null
  }

  return {
    id: event.id,
    camera: event.camera,
    label: event.label,
    startTime: event.start_time,
    endTime: event.end_time,
    score: event.score,
    stationary: event.stationary,
    hasClip: event.has_clip,
    hasSnapshot: event.has_snapshot,
    type: contents.type,
  }
}
