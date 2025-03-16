import type { SpotterEvent } from '@spotter/transport'

export const parseSpotterEvent = (contents: any): SpotterEvent | null => {
  const event = contents

  if (!event || !event.id || !event.camera || !event.label) {
    return null
  }

  return {
    id: event.id,
    camera: event.camera,
    label: event.label,
    startTime: event.startTime,
    endTime: event.endTime,
    score: event.score,
    stationary: !!event.stationary,
    hasClip: !!event.hasClip,
    hasSnapshot: !!event.hasSnapshot,
    type: event.type,
  }
}
