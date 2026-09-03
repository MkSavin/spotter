import type { SpotterEvent } from '@spotter/transport'
import type { Stenograph } from 'stenograph'
import type { CoreConfig } from '../../config'
import eventData from '../../data/event.json'
import { createManualEvent } from '../../frigate/manualEvent'

export type RealEventPayload = {
  camera: string
  label: string
  duration: number
}

export type RealEventResult = {
  eventId: string
  /** Canonical events to publish, in order. */
  events: SpotterEvent[]
}

/**
 * Creates a genuine Frigate event and returns the canonical start/end pair for
 * it. The recording is real, so the media pipeline resolves an actual clip
 * rather than 404ing on an id the NVR never had.
 */
export const realEventAction = async (
  config: CoreConfig,
  { camera, label, duration }: RealEventPayload,
  logger: Stenograph,
): Promise<RealEventResult | undefined> => {
  const eventId = await createManualEvent(
    config.frigate,
    { camera, label, duration },
    logger,
  )
  if (!eventId) return undefined

  logger.info(`Created a real Frigate event ${eventId} on "${camera}"`)

  const startTime = Date.now() / 1000
  const base: SpotterEvent = {
    ...eventData,
    id: eventId,
    camera,
    label,
    startTime,
    type: 'start',
  }

  // Frigate needs the footage to exist before the clip can be fetched.
  await Bun.sleep(duration * 1000)

  // Not ended here: the event was created with a duration, so Frigate closes it
  // itself and refuses a manual end ("has a set duration and can not be ended
  // manually"), leaving an error in the NVR's log on every test run.

  return {
    eventId,
    events: [
      base,
      {
        ...base,
        type: 'end',
        endTime: startTime + duration,
        hasClip: true,
        hasSnapshot: true,
      },
    ],
  }
}
