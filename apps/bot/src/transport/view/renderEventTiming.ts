import type { SpotterEvent } from '@spotter/transport'

const formatDate = (date: Date, format: 'date-time' | 'time'): string => {
  switch (format) {
    case 'time':
      return new Intl.DateTimeFormat('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(date)
    default:
      return new Intl.DateTimeFormat('ru-RU', {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date)
  }
}

const formatDuration = (duration: number) => {
  const seconds = duration % 60
  const minutes = Math.floor(duration / 60) % 60
  const hours = Math.floor(duration / 60 / 60) % 60
  const days = Math.floor(duration / 60 / 60 / 24)

  // TODO: use Intl instead of manual concat in future versions of typescript
  // return new Intl.DurationFormat('ru').format({ seconds: 50, minutes: 20 })

  return [
    days > 0 ? `${days} дней` : '',
    hours > 0 ? `${hours} ч` : '',
    minutes > 0 ? `${minutes} мин` : '',
    seconds > 0 ? `${seconds} c` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

export const renderEventTiming = (event: SpotterEvent): string => {
  const startDate = new Date(event.startTime * 1000)
  const endDate = event.endTime ? new Date(event.endTime * 1000) : undefined

  if (!event.endTime || !endDate) {
    return formatDate(startDate, 'date-time')
  }

  const diff = event.endTime - event.startTime

  if (diff > 60 * 60 * 24) {
    return `${formatDate(startDate, 'date-time')} - ${formatDate(endDate, 'date-time')} | ${formatDuration(diff)}`
  }

  if (diff > 60) {
    return `${formatDate(startDate, 'date-time')} - ${formatDate(endDate, 'time')} | ${formatDuration(diff)}`
  }

  return `${formatDate(startDate, 'date-time')} | ${formatDuration(diff)}`
}
