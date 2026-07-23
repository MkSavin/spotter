import { type InferSelectModel, sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Idempotency ledger: one row per event we've already emailed. The delivery
 * stream can redeliver (reclaim after a crash, at-least-once semantics), so we
 * record the `event_id` on first send and skip any later attempt — a single
 * event never produces two emails.
 */
export const notifiedEvents = sqliteTable('notified_events', {
  eventId: text('event_id').primaryKey(),
  notifiedAt: integer('notified_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
})

export type NotifiedEvent = InferSelectModel<typeof notifiedEvents>
