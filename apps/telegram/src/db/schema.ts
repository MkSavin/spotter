import { ROLES } from '@spotter/transport'
import { type InferSelectModel, sql } from 'drizzle-orm'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// The role vocabulary belongs to the contract, not to this database; re-exported
// so table definitions and their consumers share one import.
export { ROLE_RANK, ROLES, Role } from '@spotter/transport'

/**
 * Authorized Telegram chats. Every chat that has redeemed an access code gets
 * a row; all rows receive event notifications via supplySubscribers.
 */
export const tgChats = sqliteTable('tg_chats', {
  id: text('id').primaryKey(),
  authorizedAt: integer('authorized_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
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
  },
  (table) => [primaryKey({ columns: [table.eventId, table.tgChatId] })],
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

export type EventMessage = {
  id: number
  chatId: string
}
