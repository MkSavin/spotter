import type { StenographFormatter } from '../types'

const pad = (value: number, width = 2): string =>
  String(value).padStart(width, '0')

/**
 * `dd.mm.yyyy hh:mm:ss` in the local zone.
 *
 * Local, not UTC: container logs are read next to a wall clock, and TZ is
 * already set per node. Built by hand rather than via Intl — this runs on every
 * line, and a formatter allocation per log is not worth the elegance.
 */
export const formatTimestamp = (date: Date): string =>
  `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ` +
  `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`

/**
 * Stamps every line with the date and time.
 *
 * Without it a log says what happened but not when, so correlating our lines
 * against an NVR's or a broker's means guessing. Docker's own `--timestamps`
 * only helps when someone remembers to pass it.
 */
export const timestampFormat = (
  now: () => Date = () => new Date(),
): StenographFormatter => {
  return (message) => ({
    ...message,
    prefix: message.prefix
      ? `${formatTimestamp(now())} ${message.prefix}`
      : formatTimestamp(now()),
  })
}
