import { parseSpotterEvent, type SpotterEvent } from '@spotter/transport'

export type ParseFrigateEventOptions = {
  skipMotionless?: boolean
}

/**
 * Maps a raw Frigate MQTT payload (`frigate/events`) to the canonical
 * `SpotterEvent` contract, validating it before it leaves the adapter. Throws on
 * unparsable or suspicious events so the controller can skip them.
 */
export const parseFrigateEvent = (
  contents: any,
  { skipMotionless = true }: ParseFrigateEventOptions = {},
): SpotterEvent => {
  const event = contents?.after

  if (!event?.id || !event.camera || !event.label) {
    throw new Error('Got not parsable event. Skipping...')
  }

  const type =
    contents.type === 'new' || contents.type === 'start'
      ? 'start'
      : contents.type

  // Frigate writes neither snapshot nor clip when `position_changes` is 0
  // (should_save_snapshot / should_retain_recording), so such an event can only
  // ever be delivered empty. Dropped at every stage: skipping the `end` alone
  // would leave the lifecycle open.
  if (skipMotionless && event.position_changes === 0) {
    throw new Error('Event has no position changes, skipping due to suspicion')
  }

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

/**
 * The few fields that say why an event was rejected.
 *
 * The raw payload carries `before` and `after` in full — a couple of kilobytes
 * of bounding boxes, attributes and ratios per line, none of which explains a
 * parse failure.
 */
export const summarizeEvent = (contents: any): Record<string, unknown> => {
  const event = contents?.after ?? contents?.before
  if (!event) return { type: contents?.type }

  return {
    type: contents?.type,
    id: event.id,
    camera: event.camera,
    label: event.label,
    positionChanges: event.position_changes,
    stationary: event.stationary,
    hasClip: event.has_clip,
    hasSnapshot: event.has_snapshot,
  }
}
