/**
 * Parsing of the day/time span a user types for a timelapse.
 *
 * Everything here works in the bot's configured timezone: a user writing
 * `15.08` means that day where they live, and turning it into UTC directly
 * would shift the export by the offset.
 */

/** Minutes to add to a local wall-clock time to reach UTC, for a given zone. */
const offsetMinutes = (zone: string, at: Date): number => {
  // Format the instant in the target zone, read it back as if it were UTC, and
  // the difference is the offset — no table of zones needed.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)

  const field = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value)

  const asUtc = Date.UTC(
    field('year'),
    field('month') - 1,
    field('day'),
    // 24 is how this formatter spells midnight.
    field('hour') % 24,
    field('minute'),
    field('second'),
  )

  return (asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000
}

/** Unix seconds for a local wall-clock moment in `zone`. */
export const zonedTime = (
  zone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): number => {
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  // Two passes: the first offset may be the wrong side of a DST change.
  const first = offsetMinutes(zone, new Date(guess))
  const second = offsetMinutes(zone, new Date(guess - first * 60_000))

  return Math.floor((guess - second * 60_000) / 1000)
}

export type DateSpan = { start: number; end: number }

const DATE = /^(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?$/
const TIME = /^(\d{1,2})(?::(\d{2}))?$/

/** Today's date in `zone`, as `[year, month, day]`. */
const todayIn = (zone: string, now: Date): [number, number, number] => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

  const [year, month, day] = parts.split('-').map(Number)
  return [year, month, day]
}

/**
 * Understands what a person would plausibly type for "which day":
 *
 *   `сегодня` / `вчера`     — that whole day
 *   `15.08`                 — that day, year inferred
 *   `15.08.2025`            — that day
 *   `15.08 09:00-18:00`     — part of that day
 *
 * Returns `null` when the text is not a span, so the caller can re-ask.
 */
export const parseDateSpan = (
  raw: string,
  zone: string,
  now: Date = new Date(),
): DateSpan | null => {
  const text = raw.trim().toLowerCase()
  if (!text) return null

  const [head, ...rest] = text.split(/\s+/)

  let year: number
  let month: number
  let day: number

  if (head === 'сегодня') {
    ;[year, month, day] = todayIn(zone, now)
  } else if (head === 'вчера') {
    const [y, m, d] = todayIn(zone, now)
    const shifted = new Date(Date.UTC(y, m - 1, d - 1))
    year = shifted.getUTCFullYear()
    month = shifted.getUTCMonth() + 1
    day = shifted.getUTCDate()
  } else {
    const match = DATE.exec(head)
    if (!match) return null

    day = Number(match[1])
    month = Number(match[2])
    const [currentYear] = todayIn(zone, now)

    year = match[3]
      ? Number(match[3]) < 100
        ? 2000 + Number(match[3])
        : Number(match[3])
      : currentYear

    // Reject impossible dates rather than letting Date roll them over: `32.01`
    // would silently become the 1st of February.
    const probe = new Date(Date.UTC(year, month - 1, day))
    if (
      probe.getUTCMonth() + 1 !== month ||
      probe.getUTCDate() !== day ||
      month < 1 ||
      month > 12
    ) {
      return null
    }
  }

  const window = rest.join('')

  if (!window) {
    return {
      start: zonedTime(zone, year, month, day),
      // Exclusive end: the next midnight, so the whole day is covered.
      end: zonedTime(zone, year, month, day + 1),
    }
  }

  const [from, to] = window.split('-')
  if (!from || !to) return null

  const fromMatch = TIME.exec(from)
  const toMatch = TIME.exec(to)
  if (!fromMatch || !toMatch) return null

  const fromHour = Number(fromMatch[1])
  const toHour = Number(toMatch[1])
  const fromMinute = Number(fromMatch[2] ?? 0)
  const toMinute = Number(toMatch[2] ?? 0)

  if (fromHour > 24 || toHour > 24 || fromMinute > 59 || toMinute > 59) {
    return null
  }

  const start = zonedTime(zone, year, month, day, fromHour, fromMinute)
  const end = zonedTime(zone, year, month, day, toHour, toMinute)

  return end > start ? { start, end } : null
}

/** Renders a span the way it was most likely typed, for confirmation. */
export const formatSpan = (span: DateSpan, zone: string): string => {
  const format = new Intl.DateTimeFormat('ru-RU', {
    timeZone: zone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  return `${format.format(new Date(span.start * 1000))} — ${format.format(
    new Date(span.end * 1000),
  )}`
}
