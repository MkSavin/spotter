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

type CalendarDate = { year: number; month: number; day: number }

/** Shifts a calendar date by whole days, rolling months and years over. */
const shiftDays = (date: CalendarDate, days: number): CalendarDate => {
  const moved = new Date(Date.UTC(date.year, date.month - 1, date.day + days))
  return {
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: moved.getUTCDate(),
  }
}

/** `15.08` / `15.08.2026`, rejecting dates that do not exist. */
const parseDate = (
  token: string,
  zone: string,
  now: Date,
): CalendarDate | null => {
  const match = DATE.exec(token)
  if (!match) return null

  const day = Number(match[1])
  const month = Number(match[2])
  const [currentYear] = todayIn(zone, now)

  const year = match[3]
    ? Number(match[3]) < 100
      ? 2000 + Number(match[3])
      : Number(match[3])
    : currentYear

  // Reject impossible dates rather than letting Date roll them over: `32.01`
  // would silently become the 1st of February.
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    month < 1 ||
    month > 12 ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    return null
  }

  return { year, month, day }
}

/** `9`, `09:30` → minutes since midnight. */
const parseTime = (token: string): number | null => {
  const match = TIME.exec(token)
  if (!match) return null

  const hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  if (hour > 24 || minute > 59) return null

  return hour * 60 + minute
}

/** A named day, resolved against `now` in the bot's zone. */
const KEYWORDS: Record<string, number> = {
  сегодня: 0,
  вчера: -1,
  позавчера: -2,
}

const atMinutes = (zone: string, date: CalendarDate, minutes: number): number =>
  zonedTime(
    zone,
    date.year,
    date.month,
    date.day,
    Math.floor(minutes / 60),
    minutes % 60,
  )

/**
 * Understands what a person would plausibly type for a period:
 *
 *   `сегодня` / `вчера`              — that whole day
 *   `15.08`                          — that day, year inferred
 *   `15.08 09:00-18:00`              — part of that day
 *   `28.08 09:00 - 31.08 22:00`      — across several days
 *   `28.08-31.08`                    — from the start of one day to the end of another
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

  // Split on the range dash, tolerating spaces around it. Dots and slashes
  // inside a date are safe: only a dash separates the two sides.
  const sides = text.split(/\s*[-–—]\s*/).filter(Boolean)

  // One side and a keyword: a whole named day.
  if (sides.length === 1) {
    const single = sides[0]

    const offset = KEYWORDS[single]
    if (offset !== undefined) {
      const [y, m, d] = todayIn(zone, now)
      const date = shiftDays({ year: y, month: m, day: d }, offset)
      return {
        start: atMinutes(zone, date, 0),
        end: atMinutes(zone, shiftDays(date, 1), 0),
      }
    }

    const date = parseDate(single, zone, now)
    if (!date) return null

    return {
      // Exclusive end: the next midnight, so the whole day is covered.
      start: atMinutes(zone, date, 0),
      end: atMinutes(zone, shiftDays(date, 1), 0),
    }
  }

  if (sides.length !== 2) return null

  const [left, right] = sides.map((side) => side.split(/\s+/).filter(Boolean))

  // The left side always starts with a date; a keyword stands in for one.
  const leftKeyword = KEYWORDS[left[0]]
  let leftDate: CalendarDate | null

  if (leftKeyword !== undefined) {
    const [y, m, d] = todayIn(zone, now)
    leftDate = shiftDays({ year: y, month: m, day: d }, leftKeyword)
  } else {
    leftDate = parseDate(left[0], zone, now)
  }

  if (!leftDate) return null

  const leftTime = left[1] ? parseTime(left[1]) : 0
  if (leftTime === null || left.length > 2) return null

  // The right side may repeat the date (`28.08 09:00 - 31.08 22:00`) or give
  // only a time, meaning the same day (`15.08 09:00-18:00`).
  let rightDate: CalendarDate
  let rightTime: number | null

  if (right.length === 2) {
    const parsed = parseDate(right[0], zone, now)
    if (!parsed) return null
    rightDate = parsed
    rightTime = parseTime(right[1])
  } else if (right.length === 1) {
    const asTime = parseTime(right[0])

    if (asTime !== null) {
      // A bare time belongs to the starting day.
      rightDate = leftDate
      rightTime = asTime
    } else {
      // A bare date means the end of that day.
      const parsed = parseDate(right[0], zone, now)
      if (!parsed) return null
      rightDate = shiftDays(parsed, 1)
      rightTime = 0
    }
  } else {
    return null
  }

  if (rightTime === null) return null

  const start = atMinutes(zone, leftDate, leftTime)
  const end = atMinutes(zone, rightDate, rightTime)

  return end > start ? { start, end } : null
}

/**
 * Ready-made periods offered as buttons. Labels carry the actual dates rather
 * than the word behind them: "вчера" on a card the user reads tomorrow means
 * something else, and a timelapse is worth being sure about before it runs for
 * minutes.
 */
export const quickSpans = (
  zone: string,
  now: Date = new Date(),
): Array<{ code: string; label: string }> => {
  const format = new Intl.DateTimeFormat('ru-RU', {
    timeZone: zone,
    day: '2-digit',
    month: '2-digit',
  })

  const day = (offset: number): { code: string; label: string } => {
    const [y, m, d] = todayIn(zone, now)
    const date = shiftDays({ year: y, month: m, day: d }, offset)
    const start = atMinutes(zone, date, 0)
    const end = atMinutes(zone, shiftDays(date, 1), 0)
    const stamp = format.format(new Date(start * 1000))

    return {
      code: `${start}-${end}`,
      label: offset === 0 ? `📅 Сегодня (${stamp})` : `📅 ${stamp}`,
    }
  }

  const nowSeconds = Math.floor(now.getTime() / 1000)
  const hours = (count: number) => ({
    code: `${nowSeconds - count * 3600}-${nowSeconds}`,
    label: `🕐 Последние ${count} ч`,
  })

  return [hours(24), day(0), day(-1), day(-2), hours(6)]
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
