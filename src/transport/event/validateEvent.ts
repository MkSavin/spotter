import type { Event } from '@prisma/client'

export const validateEvent = (contents: any): Event | null => {
  // TODO: add data validation and normalization
  const event = contents?.after

  if (!event || !event.id || !event.camera || !event.label) {
    return null
  }

  return {
    id: event.id,
    code: event.id?.split('-').at(1) ?? event.id,
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
    type: contents.type,
    messages: [],
  }
}

/*
/ # mosquitto_sub -t 'frigate/events' --remove-retained --retained-only
/ # mosquitto_sub --remote-retained -t 'frigate/events' -W 1
Error: Unknown option '--remote-retained'.

Use 'mosquitto_sub --help' to see usage.
/ # mosquitto_sub --remove-retained -t 'frigate/events' -W 1
Timed out
/ # mosquitto_sub --remove-retained -t 'frigate/events' -W 1
Timed out
/ # mosquitto_sub -t 'frigate/events' --remove-retained --retained-only
/ # mosquitto_sub -t frigate/events
*
*/
