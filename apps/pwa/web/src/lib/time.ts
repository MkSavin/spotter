import {
  format,
  formatDistanceToNowStrict,
  isToday,
  isYesterday,
} from 'date-fns'
import { ru } from 'date-fns/locale'

export const eventDate = (startTime: number): Date => new Date(startTime * 1000)

export const relativeTime = (startTime: number): string =>
  formatDistanceToNowStrict(eventDate(startTime), {
    addSuffix: true,
    locale: ru,
  })

export const clockTime = (startTime: number): string =>
  format(eventDate(startTime), 'HH:mm', { locale: ru })

/** Day-group heading: «Сегодня» / «Вчера» / a full date. */
export const dayHeading = (startTime: number): string => {
  const date = eventDate(startTime)
  if (isToday(date)) return 'Сегодня'
  if (isYesterday(date)) return 'Вчера'
  return format(date, 'd MMMM', { locale: ru })
}

/** Stable day key for grouping (yyyy-MM-dd). */
export const dayKey = (startTime: number): string =>
  format(eventDate(startTime), 'yyyy-MM-dd')
