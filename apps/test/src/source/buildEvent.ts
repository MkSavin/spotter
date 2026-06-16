import type { SpotterEvent } from '@spotter/transport'

/** Mints a Frigate-style id (`<epoch.micros>-<rand>`) so `eventCode` yields the suffix. */
export const newEventId = (): string => {
  const seconds = (Date.now() / 1000).toFixed(6)
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${seconds}-${suffix}`
}

export type EventPhase = 'start' | 'update' | 'end'

/** Builds a canonical SpotterEvent for a given lifecycle phase. */
export const buildEvent = (params: {
  id: string
  camera: string
  label: string
  type: EventPhase
  startTime: number
}): SpotterEvent => {
  const { id, camera, label, type, startTime } = params
  const ended = type === 'end'

  return {
    id,
    camera,
    label,
    startTime,
    endTime: ended ? startTime + 30 : null,
    score: 0.9,
    stationary: false,
    // On `end` the media is "available" so the request → staged → processed
    // pipeline runs against the local fixtures.
    hasClip: ended,
    hasSnapshot: ended,
    type,
  }
}
