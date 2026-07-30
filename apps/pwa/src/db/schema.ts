import { type InferSelectModel, sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

const now = sql`(unixepoch() * 1000)`

/**
 * One row per device push subscription (the browser's `PushSubscription`).
 * `endpoint` is unique — re-subscribing the same device upserts. Dead endpoints
 * (push service replies 404/410) are deleted. `recipient_uuid` links the device
 * to an authorized recipient once the one-time code is accepted.
 */
export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  deviceLabel: text('device_label'),
  recipientUuid: text('recipient_uuid'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(now),
})

/**
 * Idempotency ledger: one row per event already pushed. The delivery stream can
 * redeliver (reclaim after a crash, at-least-once), so recording `event_id` on
 * first push and skipping later attempts keeps a single event to one push.
 */
export const notifiedEvents = sqliteTable('notified_events', {
  eventId: text('event_id').primaryKey(),
  notifiedAt: integer('notified_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(now),
})

/**
 * Rolling cache of the latest events, so the feed isn't empty before the first
 * push arrives. Not a source of truth — trimmed to the newest N rows. `payload`
 * is the JSON-serialized feed entry (event + presign-ready media keys).
 */
export const recentEvents = sqliteTable('recent_events', {
  eventId: text('event_id').primaryKey(),
  payload: text('payload', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(now),
})

export type PushSubscriptionRow = InferSelectModel<typeof pushSubscriptions>
export type NotifiedEvent = InferSelectModel<typeof notifiedEvents>
export type RecentEvent = InferSelectModel<typeof recentEvents>
