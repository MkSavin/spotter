// Deep import, not the barrel: drizzle-kit runs under Node and the barrel
// pulls in Bun-only modules.
import { ROLES } from '@spotter/transport/src/schema/role'
import { type InferSelectModel, sql } from 'drizzle-orm'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// The role vocabulary belongs to the contract, not to this database; re-exported
// so table definitions and their consumers share one import.
export {
  ROLE_RANK,
  ROLES,
  Role,
} from '@spotter/transport/src/schema/role'

/**
 * Authorized Telegram chats. Every chat that has redeemed an access code gets
 * a row; all rows receive event notifications via supplySubscribers.
 */
export const tgChats = sqliteTable('tg_chats', {
  id: text('id').primaryKey(),
  authorizedAt: integer('authorized_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  // Silence for this chat alone; null means it receives events. Stored rather
  // than held in memory so a restart does not un-mute someone mid-holiday.
  mutedUntil: integer('muted_until', { mode: 'timestamp_ms' }),
})

/**
 * Maps a (tg_user_id, tg_chat_id) pair to a server recipient UUID. Stores a
 * cached role copy so the session middleware can read it without an RPC call.
 */
export const tgBindings = sqliteTable(
  'tg_bindings',
  {
    tgUserId: text('tg_user_id').notNull(),
    tgChatId: text('tg_chat_id').notNull(),
    recipientUuid: text('recipient_uuid').notNull(),
    username: text('username'),
    role: text('role', { enum: ROLES }).notNull().default('VIEWER'),
    authorizedAt: integer('authorized_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [primaryKey({ columns: [table.tgUserId, table.tgChatId] })],
)

/**
 * Tracks which Telegram message_id was sent per (event, chat) so edits and
 * media replies can find the original message.
 */
export const eventMessages = sqliteTable(
  'event_messages',
  {
    eventId: text('event_id').notNull(),
    tgChatId: text('tg_chat_id').notNull(),
    messageId: integer('message_id').notNull(),
    // Only ever read by retention: the rows stop being useful once the message
    // is too old to still be edited, but nothing else knows when that was.
    // Defaulted in the application, not the column: SQLite rejects a
    // non-constant DEFAULT on ALTER TABLE ADD COLUMN once the table has rows,
    // which is every deployment that has ever sent a message.
    sentAt: integer('sent_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.tgChatId] })],
)

/**
 * Exports the bot is waiting on, so `/timelapse_status` can answer after a
 * restart. Rows are dropped when the export resolves either way — this is a
 * work list, not a history.
 */
export const timelapseWaits = sqliteTable(
  'timelapse_waits',
  {
    camera: text('camera').notNull(),
    tgChatId: text('tg_chat_id').notNull(),
    /** Unix seconds, the requested span. */
    start: integer('start').notNull(),
    end: integer('end').notNull(),
    messageId: integer('message_id'),
    /** Unix ms when the NVR accepted it; `null` until the first progress tick. */
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    requestedAt: integer('requested_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    primaryKey({ columns: [table.camera, table.start, table.tgChatId] }),
  ],
)

/**
 * Last version seen per service, so a rollout is still detected after the bot
 * itself restarts — an in-memory registry would report every service as new.
 */
export const serviceVersions = sqliteTable(
  'service_versions',
  {
    node: text('node').notNull(),
    service: text('service').notNull(),
    version: text('version').notNull(),
    seenAt: integer('seen_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [primaryKey({ columns: [table.node, table.service] })],
)

/**
 * In-progress command dialogs, keyed by the session's (chat, user) pair, so a
 * bot restart does not throw away a half-answered wizard.
 */
export const dialogStates = sqliteTable(
  'dialog_states',
  {
    tgUserId: text('tg_user_id').notNull(),
    tgChatId: text('tg_chat_id').notNull(),
    /** Serialized `DialogState`; shape is owned by the dialog engine. */
    state: text('state').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [primaryKey({ columns: [table.tgUserId, table.tgChatId] })],
)

/**
 * Last catalog snapshot per source. The `spotter.catalog.<source>` key lives on
 * the ingest node and does not cross the forwarder, so without this a cloud
 * restart shows "неизв. камера" until the taxonomy happens to change.
 */
export const catalogSnapshots = sqliteTable('catalog_snapshots', {
  source: text('source').primaryKey(),
  /** Serialized `Catalog`; the shape belongs to @spotter/transport. */
  snapshot: text('snapshot').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
})

/**
 * Events whose clip the user is waiting for. Held in memory the wait would be
 * lost on restart, leaving the "⏳" button frozen with no way to retry.
 */
export const clipWaits = sqliteTable('clip_waits', {
  eventId: text('event_id').primaryKey(),
  stage: text('stage').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
})

export type TgChat = InferSelectModel<typeof tgChats>
export type TgBinding = InferSelectModel<typeof tgBindings>
export type ServiceVersion = InferSelectModel<typeof serviceVersions>
export type DialogStateRow = InferSelectModel<typeof dialogStates>
export type CatalogSnapshotRow = InferSelectModel<typeof catalogSnapshots>
export type ClipWaitRow = InferSelectModel<typeof clipWaits>
export type TimelapseWait = InferSelectModel<typeof timelapseWaits>

export type EventMessage = {
  id: number
  chatId: string
}
