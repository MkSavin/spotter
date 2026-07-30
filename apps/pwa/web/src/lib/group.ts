import { dayHeading, dayKey } from './time'
import type { FeedEntry } from './types'

export type DayGroup = { key: string; heading: string; entries: FeedEntry[] }

/** Groups feed entries into consecutive day sections, preserving order. */
export function groupByDay(entries: FeedEntry[]): DayGroup[] {
  const groups: DayGroup[] = []

  for (const entry of entries) {
    const key = dayKey(entry.event.startTime)
    const last = groups.at(-1)
    if (last?.key === key) {
      last.entries.push(entry)
    } else {
      groups.push({
        key,
        heading: dayHeading(entry.event.startTime),
        entries: [entry],
      })
    }
  }

  return groups
}
