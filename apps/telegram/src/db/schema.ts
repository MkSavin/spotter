import { type InferSelectModel, sql } from 'drizzle-orm'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const ROLES = ['VIEWER', 'USER', 'ADMIN'] as const
export type Role = (typeof ROLES)[number]

export const Role = {
  VIEWER: 'VIEWER',
  USER: 'USER',
  ADMIN: 'ADMIN',
} as const satisfies Record<Role, Role>

export const ROLE_RANK: Record<Role, number> = {
  VIEWER: 1,
  USER: 2,
  ADMIN: 3,
}

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

export type TgChat = InferSelectModel<typeof tgChats>
export type TgBinding = InferSelectModel<typeof tgBindings>
export type ServiceVersion = InferSelectModel<typeof serviceVersions>

export type EventMessage = {
  id: number
  chatId: string
}
