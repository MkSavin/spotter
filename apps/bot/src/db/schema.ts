import { type InferSelectModel, sql } from 'drizzle-orm'
import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

/** Roles, least to most privileged (anonymous = no row). */
export const ROLES = ['VIEWER', 'USER', 'ADMIN'] as const

export type Role = (typeof ROLES)[number]

/** Value object so `Role.ADMIN` works alongside `Role` as a type. */
export const Role = {
  VIEWER: 'VIEWER',
  USER: 'USER',
  ADMIN: 'ADMIN',
} as const satisfies Record<Role, Role>

/** Privilege rank for the command access system (anonymous = 0). */
export const ROLE_RANK: Record<Role, number> = {
  VIEWER: 1,
  USER: 2,
  ADMIN: 3,
}

const authorizedAt = integer('authorized_at', { mode: 'timestamp_ms' })
  .notNull()
  .default(sql`(unixepoch() * 1000)`)

export const chats = sqliteTable('chats', {
  id: text('id').primaryKey(),
  token: text('token').notNull(),
  authorizedAt,
})

export const users = sqliteTable(
  'users',
  {
    id: text('id').notNull(),
    chatId: text('chat_id').notNull(),
    /** Normalized @username (nullable); used to address users in admin commands. */
    username: text('username'),
    role: text('role', { enum: ROLES }).notNull().default('VIEWER'),
    token: text('token').notNull(),
    authorizedAt,
  },
  // Composite PK (id, chat_id): one user may be authorized in multiple chats.
  (table) => [primaryKey({ columns: [table.id, table.chatId] })],
)

/**
 * Single-use access codes (redeemed via `/login` or the `/start` deep-link, then
 * deleted). `/user_sign` mints VIEWER codes; the CLI may mint higher roles.
 */
export const accessTokens = sqliteTable('access_tokens', {
  id: text('id').primaryKey(),
  role: text('role', { enum: ROLES }).notNull().default('VIEWER'),
  /** Optional binding: only this normalized @username may redeem the code. */
  username: text('username'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
})

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  camera: text('camera').notNull(),
  label: text('label'),
  startTime: real('start_time').notNull(),
  endTime: real('end_time'),
  score: real('score').notNull(),
  stationary: integer('stationary', { mode: 'boolean' })
    .notNull()
    .default(false),
  hasClip: integer('has_clip', { mode: 'boolean' }).notNull().default(false),
  hasSnapshot: integer('has_snapshot', { mode: 'boolean' })
    .notNull()
    .default(false),
  type: text('type').notNull().default('start'),
})

/** Telegram messages sent per event (one row per chat). */
export const eventMessages = sqliteTable(
  'event_messages',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    chatId: text('chat_id').notNull(),
    messageId: integer('message_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.chatId] })],
)

export type Chat = InferSelectModel<typeof chats>
export type User = InferSelectModel<typeof users>
export type AccessToken = InferSelectModel<typeof accessTokens>
export type Event = InferSelectModel<typeof events>

/** In-memory shape of an `event_messages` row (Telegram message id + chat id). */
export type EventMessage = {
  id: number
  chatId: string
}
