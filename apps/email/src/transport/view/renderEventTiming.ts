import type { SpotterEvent } from '@spotter/transport'

const formatDate = (
  date: Date,
  format: 'date-time' | 'time',
  timezone: string,
): string => {
  switch (format) {
    case 'time':
      return new Intl.DateTimeFormat('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone,
      }).format(date)
    default:
      return new Intl.DateTimeFormat('ru-RU', {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone,
      }).format(date)
  }
}

const formatDuration = (duration: number) => {
  const seconds = duration % 60
  const minutes = Math.floor(duration / 60) % 60
  const hours = Math.floor(duration / 60 / 60) % 60
  const days = Math.floor(duration / 60 / 60 / 24)

  return [
    days > 0 ? `${days} дней` : '',
    hours > 0 ? `${hours} ч` : '',
    minutes > 0 ? `${minutes} мин` : '',
    seconds > 0 ? `${seconds} c` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/** Human-readable start/end/duration line for an event (Moscow-tz by default). */
export const renderEventTiming = (
  event: SpotterEvent,
  timezone: string,
): string => {
  const startDate = new Date(event.startTime * 1000)
  const endDate = event.endTime ? new Date(event.endTime * 1000) : undefined

  if (!event.endTime || !endDate) {
    return formatDate(startDate, 'date-time', timezone)
  }

  const diff = Math.round(event.endTime - event.startTime)

  if (diff > 60 * 60 * 24) {
    return `${formatDate(startDate, 'date-time', timezone)} - ${formatDate(endDate, 'date-time', timezone)} | ${formatDuration(diff)}`
  }

  if (diff > 60) {
    return `${formatDate(startDate, 'date-time', timezone)} - ${formatDate(endDate, 'time', timezone)} | ${formatDuration(diff)}`
  }

  return `${formatDate(startDate, 'date-time', timezone)} | ${formatDuration(diff)}`
}

/** Short `HH:MM` stamp for the subject line. */
export const renderEventTime = (
  event: SpotterEvent,
  timezone: string,
): string =>
  new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(event.startTime * 1000))
