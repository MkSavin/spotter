import type { SpotterEvent } from '@spotter/transport'

import eventData from '../../data/event.json'

export type EventTestPayload = {
  eventId: string
  type: 'start' | 'update' | 'end'
  timestamp: number
}

/** Raw seed request off the stream, before any of it is trusted. */
export type EventTestSeed = {
  eventId?: unknown
  type?: unknown
}

const eventTypes = ['start', 'update', 'end'] as const

/**
 * Derives a seed request into a usable payload: a supplied id keeps its own
 * timestamp (Frigate ids lead with one, so a re-seeded event stays consistent),
 * anything missing or malformed falls back to now.
 */
export const resolveEventTestPayload = (
  seed: EventTestSeed,
  now: number = Date.now(),
): EventTestPayload => {
  const supplied = typeof seed.eventId === 'string' ? seed.eventId : undefined
  const parsed = supplied
    ? Number.parseFloat(supplied.split('-').at(0) ?? '')
    : Number.NaN

  const type =
    eventTypes.find((candidate) => candidate === seed.type) ?? 'start'

  return {
    eventId: supplied ?? `${now}-${Math.random().toString(36).slice(2)}`,
    type,
    timestamp: Number.isNaN(parsed) ? now : parsed,
  }
}

export const eventTestAction = async (
  payload: EventTestPayload,
): Promise<SpotterEvent | undefined> => {
  const { eventId: id, type, timestamp } = payload

  const startTime = timestamp
  const endTime = timestamp + 3 * 60 + 32

  const message: SpotterEvent = {
    ...eventData,
    id,
    type,
    startTime,
  }

  if (type === 'end') {
    return {
      ...message,
      endTime,
      hasSnapshot: true,
      hasClip: true,
    }
  }

  return message
}
