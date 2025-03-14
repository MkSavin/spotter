import type { SpotterEvent } from '@spotter/transport'

import eventData from '../../data/event.json'

export type EventTestPayload = {
  eventId: string
  type: 'start' | 'update' | 'end'
  timestamp: number
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
