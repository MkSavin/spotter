import type { SpotterEvent } from '../schema/spotterEvent'

const formatDate = (
  date: Date,
  format: 'date-time' | 'time',
  timezone: string,
): string =>
  new Intl.DateTimeFormat('ru-RU', {
    ...(format === 'date-time' ? { month: 'short', day: '2-digit' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(date)

const formatDuration = (duration: number): string => {
  const seconds = duration % 60
  const minutes = Math.floor(duration / 60) % 60
  const hours = Math.floor(duration / 60 / 60) % 24
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

/** Short `HH:MM` stamp of the event's start (for compact subject/title lines). */
export const renderEventTime = (
  event: SpotterEvent,
  timezone: string,
): string => formatDate(new Date(event.startTime * 1000), 'time', timezone)

/** Human-readable start/end/duration line for an event. */
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
  const start = formatDate(startDate, 'date-time', timezone)

  if (diff > 60 * 60 * 24) {
    return `${start} - ${formatDate(endDate, 'date-time', timezone)} | ${formatDuration(diff)}`
  }
  if (diff > 60) {
    return `${start} - ${formatDate(endDate, 'time', timezone)} | ${formatDuration(diff)}`
  }
  return `${start} | ${formatDuration(diff)}`
}

/** Resolved display labels for an event (looked up per-app in the catalog). */
export type EventLabels = {
  camera: string
  object: string
}

export type RenderedEvent = {
  /** e.g. `человек · Двор` — object and camera. */
  headline: string
  camera: string
  object: string
  /** Start/end/duration line. */
  timing: string
  /** `HH:MM` start stamp. */
  time: string
}

/**
 * Channel-agnostic core of an event's human-readable text. Frontends resolve
 * labels from their own `CatalogCache`, then wrap this into their medium
 * (email HTML, Telegram markup, PWA push/card).
 */
export const renderEvent = (
  event: SpotterEvent,
  labels: EventLabels,
  timezone: string,
): RenderedEvent => ({
  headline: `${labels.object} · ${labels.camera}`,
  camera: labels.camera,
  object: labels.object,
  timing: renderEventTiming(event, timezone),
  time: renderEventTime(event, timezone),
})
