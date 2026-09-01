/**
 * Ready-made periods for a timelapse.
 *
 * The browser knows the user's own timezone, so unlike the bot — which has to
 * be told one — these are computed from local midnight directly. Labels carry
 * the actual date: a timelapse runs for minutes, and finding out afterwards
 * that "вчера" meant a different day is a wasted export.
 */
export type Span = { start: number; end: number }

const startOfDay = (offsetDays: number): Date => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + offsetDays)
  return date
}

const seconds = (date: Date): number => Math.floor(date.getTime() / 1000)

const dayLabel = (date: Date): string =>
  new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' }).format(
    date,
  )

export type QuickSpan = { key: string; label: string; span: Span }

export const quickSpans = (): QuickSpan[] => {
  const now = Math.floor(Date.now() / 1000)

  const wholeDay = (offset: number): QuickSpan => {
    const from = startOfDay(offset)
    const to = startOfDay(offset + 1)
    return {
      key: `day${offset}`,
      label: offset === 0 ? `Сегодня (${dayLabel(from)})` : dayLabel(from),
      span: { start: seconds(from), end: seconds(to) },
    }
  }

  return [
    {
      key: 'h24',
      label: 'Последние 24 ч',
      span: { start: now - 86_400, end: now },
    },
    wholeDay(0),
    wholeDay(-1),
    wholeDay(-2),
    {
      key: 'h6',
      label: 'Последние 6 ч',
      span: { start: now - 21_600, end: now },
    },
  ]
}

/** `2026-09-01T14:30` from a datetime-local input → unix seconds. */
export const fromLocalInput = (value: string): number | null => {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000)
}

export const formatSpan = (span: Span): string => {
  const format = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${format.format(new Date(span.start * 1000))} — ${format.format(
    new Date(span.end * 1000),
  )}`
}
