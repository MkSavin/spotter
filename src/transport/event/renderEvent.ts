import type { Event } from '@prisma/client'
import dayjs from 'dayjs'
import get from 'lodash/get'
import type { InitContext } from '../../context'
import type { MediaTuple } from './feedMedia'

export const renderEvent = (
  event: Event,
  context: InitContext,
  mediaTuple?: MediaTuple,
): string => {
  const startDate = dayjs.unix(event.start_time)
  const endDate = event.end_time ? dayjs.unix(event.end_time) : undefined

  const dateRange = [
    startDate.format('DD.MM HH:mm'),
    endDate
      ? endDate.isSame(startDate, 'date')
        ? endDate.format('HH:mm')
        : endDate.format('DD.MM HH:mm')
      : undefined,
  ]
    .filter(Boolean)
    .join(' - ')

  const duration = endDate?.diff(startDate, 'minutes')

  const label = get(context.objectLabels, event.label ?? 'неизв. объект')
  const camera = get(context.cameraLabels, event.camera ?? 'неизв. камера')

  const score = Math.round(event.score * 1000) / 10

  const clip = mediaTuple?.hasClip ? '📼' : ''
  const snapshot = mediaTuple?.hasSnapshot ? '📸' : ''

  const title =
    event.type === 'start' ? 'Началось событие!' : 'Произошло событие!'

  return `<b>${title}</b> <code>${event.id}</code>
<b>${label}</b> ${score} | <b>${camera}</b>${clip || snapshot ? ` | ${clip}${snapshot}` : ''}
📅 ${dateRange}${duration ? ` | ⏰ ${duration} мин` : ''}`
}
